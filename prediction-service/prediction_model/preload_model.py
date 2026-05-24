import numpy as np
import math
import joblib
from sklearn import metrics
from keras.layers import *
from keras.models import *
from sklearn import preprocessing
from keras.callbacks import TensorBoard, EarlyStopping, ModelCheckpoint, ReduceLROnPlateau, Callback
from .AAindex.AAindex_sl import AAindex_hm_encoding, AAindex_ms_encoding, col_delete
import os
import pandas as pd
import time

def createModel1(input_shape):
    # human: (28, 30)
    # mouse: (28, 29)
    word_input = Input(shape=input_shape, name='word_input')

    overallResult = Convolution1D(filters=32, kernel_size=1, padding='same',activation="relu")(word_input)

    overallResult = Bidirectional(LSTM(50, dropout=0.5, activation='tanh', return_sequences=True))(overallResult)

    overallResult = Flatten()(overallResult)

    overallResult = Dense(32, activation='sigmoid')(overallResult)

    ss_output = Dense(1, activation='sigmoid', name='ss_output')(overallResult)

    return Model(inputs=[word_input], outputs=[ss_output])


def createModel3(input_shape):
    # mouse (28, 30), human (28, 29)
    word_input = Input(shape=input_shape, name='word_input')

    overallResult = Convolution1D(filters=32, kernel_size=1, padding='same', activation="relu")(word_input)

    overallResult = Convolution1D(filters=16, kernel_size=1, padding='same', activation="relu", name='CNN_output')(overallResult)

    overallResult = Bidirectional(LSTM(50, dropout=0.5, activation='tanh', return_sequences=True),name='before_Dense')(overallResult)

    overallResult = Flatten()(overallResult)

    overallResult = Dense(32, activation='sigmoid')(overallResult)

    ss_output = Dense(1, activation='sigmoid', name='ss_output')(overallResult)

    return Model(inputs=[word_input], outputs=[ss_output])


# for mouse
def createModel4():

    word_input = Input(shape=(28, 29), name='word_input')

    overallResult = Convolution1D(filters=32, kernel_size=1, padding='same', activation="relu")(word_input)
    overallResult1 = Convolution1D(filters=32, kernel_size=1, padding='same', activation="relu")(word_input)

    overallResult = Bidirectional(LSTM(50, dropout=0.5, activation='tanh', return_sequences=True))(overallResult)
    overallResult1 = LSTM(32, return_sequences=True)(overallResult1)

    overallResult = Flatten()(overallResult)
    overallResult = Dropout(0.5)(overallResult)

    overallResult1 = Flatten()(overallResult1)
    overallResult1 = Dropout(0.5)(overallResult1)

    overallResult = Concatenate(axis=1)([overallResult, overallResult1])

    overallResult = Dense(64, activation='sigmoid')(overallResult)

    ss_output = Dense(1, activation='sigmoid', name='ss_output')(overallResult)

    return Model(inputs=[word_input], outputs=[ss_output])



