(function () {
  const DATA_CACHE = {};
  const UNIPROT_CACHE_PREFIX = "oglcnac-uniprot-fasta:";
  const UNIPROT_FASTA_URL = "https://rest.uniprot.org/uniprotkb/{accession}.fasta";

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function contains(value, query) {
    return normalize(value).includes(query);
  }

  async function loadJson(path) {
    if (!DATA_CACHE[path]) {
      DATA_CACHE[path] = fetch(path).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${path}`);
        }
        return response.json();
      });
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
      species: "ncbi_id_b"
    };
    return record[allowed[field] || "gene_name_b"];
  }

  function parsePosition(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function loadAtlasRecords() {
    return loadJson("/static/data/atlas-records.json");
  }

  async function loadOgtPinRecords() {
    return loadJson("/static/data/ogt-pin-records.json");
  }

  async function searchAtlas(query, field) {
    const q = normalize(query);
    if (!q) {
      return [];
    }
    const records = await loadAtlasRecords();
    return records.filter((record) => contains(atlasField(record, field), q));
  }

  async function browseAtlas(species, query) {
    const q = normalize(query);
    const records = await loadAtlasRecords();
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
    const records = (await loadAtlasRecords()).filter((record) => record.accession === accession);
    return {
      accession,
      count: records.length,
      positions: records.map((record) => parsePosition(record.position_in_protein)).filter((position) => position !== null),
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

  window.OglcnacStaticData = {
    loadAtlasRecords,
    loadOgtPinRecords,
    searchAtlas,
    browseAtlas,
    getAtlasDetail,
    searchOgtPin,
    getOgtPinDetail,
    getCachedUniprotFasta
  };
})();
