import { contextBridge } from 'electron'

const obakeman = {}

contextBridge.exposeInMainWorld('obakeman', obakeman)
