(function () {
  const DATA_CACHE = {};
  const UNIPROT_CACHE_PREFIX = "oglcnac-uniprot-fasta:";
  const UNIPROT_FASTA_URL = "https://rest.uniprot.org/uniprotkb/{accession}.fasta";
  const ATLAS_DELIVERY = "/static/data/atlas-v2/";
  const PROJECTION_CACHE = new WeakMap();

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function contains(value, query) {
    return normalize(value).includes(query);
  }

  async function loadJson(path) {
    if (!DATA_CACHE[path]) {
      const request = fetch(path).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${path}`);
        }
        return response.json();
      }).catch((error) => {
        // A transient failure must not poison future searches or retries.
        if (DATA_CACHE[path] === request) delete DATA_CACHE[path];
        throw error;
      });
      DATA_CACHE[path] = request;
    }
    return DATA_CACHE[path];
  }

  function atlasSpeciesMatches(record, species) {
    const wanted = normalize(species || "Human");
    const actual = normalize(record.species);
    if (wanted === "c. elegans" || wanted === "caenorhabditis elegans") {
      return actual === "c. elegans" || actual === "caenorhabditis elegans";
    }
    if (wanted === "others") {
      return !["human", "mouse", "rat", "drosophila", "arabidopsis", "c. elegans", "caenorhabditis elegans"].includes(actual);
    }
    return actual === wanted;
  }

  function atlasField(record, field) {
    const allowed = {
      accession: "accession",
      protein_name: "protein_name",
      gene_name: "gene_name",
      peptide_seq: "peptide_seq",
      species: "species"
    };
    return record[allowed[field] || "accession"];
  }

  function ogtPinField(record, field) {
    const allowed = {
      uuid_a: "uuid_a",
      gene_name_a: "gene_name_a",
      uuid_b: "uuid_b",
      gene_name_b: "gene_name_b",
      protein_name_b: "protein_name_b",
      species: "ncbi_id_b"
    };
    return record[allowed[field] || "gene_name_b"];
  }

  function parsePosition(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async function loadAtlasRecords() {
    return loadJson("/static/data/atlas-records.json");
  }

  async function loadOgtPinRecords() {
    return loadJson("/static/data/ogt-pin-records.json");
  }

  async function loadAtlasRelease() {
    return loadJson("/static/data/atlas-release-v1.json");
  }

  async function loadAtlasSequenceSnapshot() {
    return loadJson("/static/data/atlas-sequences-v1.json");
  }

  async function loadAtlasAsset(relative) {
    const manifest = await loadJson("/static/data/atlas-v2/manifest.json");
    return loadJson(`${ATLAS_DELIVERY}${relative}?v=${encodeURIComponent(manifest.revision)}`);
  }

  function accessionBucket(accession) {
    let value = 2166136261;
    for (const character of accession) {
      value = Math.imul(value ^ character.codePointAt(0), 16777619) >>> 0;
    }
    return (value & 255).toString(16).padStart(2, "0");
  }

  function requestedAccessions(accessions) {
    return [...new Set((accessions || []).filter((accession) => typeof accession === "string" && accession))];
  }

  async function loadAccessionBuckets(accessions) {
    const buckets = [...new Set(accessions.map(accessionBucket))];
    return Promise.all(buckets.map((bucket) => loadAtlasAsset(`records/${bucket}.json`)));
  }

  async function loadAtlasRecordsForAccessions(accessions) {
    const wanted = new Set(requestedAccessions(accessions));
    const buckets = await loadAccessionBuckets([...wanted]);
    return buckets.flatMap((bucket) => [...wanted].flatMap((accession) =>
      Object.prototype.hasOwnProperty.call(bucket.records, accession) ? bucket.records[accession] : []
    )).sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
  }

  async function loadAtlasSequenceSnapshotForAccessions(accessions) {
    const wanted = new Set(requestedAccessions(accessions));
    const buckets = await loadAccessionBuckets([...wanted]);
    const first = buckets[0]?.snapshot || {};
    const snapshot = {
      schema_version: first.schema_version || 1,
      provenance: first.provenance || {},
      coverage: first.coverage || {},
      sequences: {},
      missing_accessions: [],
      excluded_identifiers: { non_uniprot: [], unresolved: [], blank_accession_record_ids: [] }
    };
    for (const bucket of buckets) {
      const source = bucket.snapshot;
      for (const accession of wanted) {
        if (Object.prototype.hasOwnProperty.call(source.sequences, accession)) {
          snapshot.sequences[accession] = source.sequences[accession];
        }
      }
      snapshot.missing_accessions.push(...source.missing_accessions.filter((accession) => wanted.has(accession)));
      for (const category of ["non_uniprot", "unresolved"]) {
        snapshot.excluded_identifiers[category].push(...source.excluded_identifiers[category].filter((accession) => wanted.has(accession)));
      }
    }
    snapshot.missing_accessions.sort();
    snapshot.excluded_identifiers.non_uniprot.sort();
    snapshot.excluded_identifiers.unresolved.sort();
    return snapshot;
  }

  function decodeProjection(index) {
    if (!PROJECTION_CACHE.has(index)) {
      let id = 0;
      const metadata = index.metadata.map((values) => Object.fromEntries(index.fields.map((field, column) => [field, values[column]])));
      PROJECTION_CACHE.set(index, index.metadata_rows.map((metadataRow, row) => {
        if (index.id_deltas) id += index.id_deltas[row];
        return { ...metadata[metadataRow], id: index.id_deltas ? id : index.ids[row], position_in_protein: index.positions[row] };
      }));
    }
    return PROJECTION_CACHE.get(index);
  }

  async function loadAtlasProjection() {
    return decodeProjection(await loadAtlasAsset("index.json"));
  }

  async function searchAtlasPeptides(query) {
    const peptides = await loadAtlasAsset("peptides.json");
    const values = peptides.values.map((value) => contains(value, query));
    const matches = [];
    const chunks = new Set();
    peptides.rows.forEach((value, row) => {
      if (values[value]) { matches.push(row); chunks.add(Math.floor(row / peptides.chunk_size)); }
    });
    if (!matches.length) return [];
    const accessions = new Set(peptides.accessions.flatMap((items, index) => values[index] ? items : []));
    // Repeated evidence for a precise peptide may span many row chunks but
    // only a few proteins. Their small full-evidence buckets are then cheaper.
    if (new Set([...accessions].map(accessionBucket)).size <= 6) {
      const matchingRows = new Set(matches);
      const buckets = await loadAccessionBuckets([...accessions]);
      return buckets.flatMap((bucket) => Object.values(bucket.records).flat())
        .filter(([row]) => matchingRows.has(row))
        .sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
    }
    // Broad substring queries are still exact; one global projection is cheaper
    // than fetching most of its small row chunks independently.
    if (chunks.size > 20) {
      const records = await loadAtlasProjection();
      return matches.map((row) => ({ ...records[row], peptide_seq: peptides.values[peptides.rows[row]] }));
    }
    const loaded = new Map(await Promise.all([...chunks].map(async (chunk) => [chunk,
      decodeProjection(await loadAtlasAsset(`rows/${chunk.toString(16).padStart(2, "0")}.json`))
    ])));
    return matches.map((row) => ({ ...loaded.get(Math.floor(row / peptides.chunk_size))[row % peptides.chunk_size], peptide_seq: peptides.values[peptides.rows[row]] }));
  }

  async function searchAtlas(query, field) {
    const q = normalize(query);
    if (!q) {
      return [];
    }
    if (field === "peptide_seq") return searchAtlasPeptides(q);
    const records = await loadAtlasProjection();
    return records.filter((record) => contains(atlasField(record, field), q));
  }

  async function browseAtlas(species, query) {
    const q = normalize(query);
    const records = await loadAtlasProjection();
    return records.filter((record) => {
      if (!record.accession || !atlasSpeciesMatches(record, species)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return ["accession", "entry_name", "protein_name", "gene_name", "position_in_protein"].some((field) => contains(record[field], q));
    });
  }

  async function getAtlasDetail(accession) {
    const records = await loadAtlasRecordsForAccessions([accession]);
    return {
      accession,
      count: records.length,
      positions: [...new Set(records.map((record) => parsePosition(record.position_in_protein)).filter((position) => position !== null))],
      records
    };
  }

  async function searchOgtPin(query, field) {
    const q = normalize(query);
    if (!q) {
      return [];
    }
    const records = await loadOgtPinRecords();
    const seen = new Set();
    const results = [];
    records.forEach((record) => {
      const uuid = record.uuid_b || "";
      if (!seen.has(uuid) && contains(ogtPinField(record, field), q)) {
        seen.add(uuid);
        results.push(record);
      }
    });
    return results;
  }

  async function getOgtPinDetail(uuidB) {
    const records = (await loadOgtPinRecords()).filter((record) => record.uuid_b === uuidB);
    return { uuid_b: uuidB, count: records.length, records };
  }

  async function getCachedUniprotFasta(accession) {
    if (!accession) {
      return "";
    }
    const key = UNIPROT_CACHE_PREFIX + accession;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        return cached;
      }
    } catch (error) {}
    const url = UNIPROT_FASTA_URL.replace("{accession}", encodeURIComponent(accession));
    const response = await fetch(url);
    if (!response.ok) {
      return "";
    }
    const fasta = await response.text();
    try {
      localStorage.setItem(key, fasta);
    } catch (error) {}
    return fasta;
  }

  async function getAtlasProteinFasta(accession) {
    if (!accession) {
      return "";
    }
    try {
      const snapshot = await loadAtlasSequenceSnapshotForAccessions([accession]);
      const sequence = snapshot.sequences && Object.prototype.hasOwnProperty.call(snapshot.sequences, accession) && snapshot.sequences[accession];
      if (typeof sequence === "string" && sequence) {
        return `>local|${accession}|O-GlcNAcAtlas sequence snapshot\n${sequence}`;
      }
      if (
        !Array.isArray(snapshot.missing_accessions) ||
        !snapshot.missing_accessions.includes(accession)
      ) {
        return "";
      }
    } catch (error) {
      return "";
    }
    try {
      return await getCachedUniprotFasta(accession);
    } catch (error) {
      return "";
    }
  }

  window.OglcnacStaticData = {
    loadAtlasRecords,
    loadOgtPinRecords,
    loadAtlasRelease,
    loadAtlasSequenceSnapshot,
    loadAtlasRecordsForAccessions,
    loadAtlasSequenceSnapshotForAccessions,
    searchAtlas,
    browseAtlas,
    getAtlasDetail,
    searchOgtPin,
    getOgtPinDetail,
    getCachedUniprotFasta,
    getAtlasProteinFasta
  };
})();
