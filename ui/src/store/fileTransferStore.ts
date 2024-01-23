import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import KinoFile from '../types/KinoFile'
import UqbarEncryptorApi from '@uqbar/client-encryptor-api'

export interface FileTransferStore {
  handleWsMessage: (message: string) => void
  files: KinoFile[]
  setFiles: (files: KinoFile[]) => void
  set: (partial: FileTransferStore | Partial<FileTransferStore>) => void
  filesInProgress: { [key: string]: number }
  setFilesInProgress: (filesInProgress: { [key: string]: number }) => void
  api: UqbarEncryptorApi | null
  setApi: (api: UqbarEncryptorApi) => void
  refreshFiles: () => void
}

type WsMessage =
  | { kind: 'progress', data: { name: string, progress: number } }
  | { kind: 'uploaded', data: { name: string, size: number } }

const useFileTransferStore = create<FileTransferStore>()(
  persist(
    (set, get) => ({
      files: [],
      filesInProgress: {},
      api: null,
      setApi: (api) => set({ api }),
      setFilesInProgress: (filesInProgress) => set({ filesInProgress }),
      setFiles: (files) => set({ files }),    
      handleWsMessage: (json: string | Blob) => {
        const { filesInProgress, setFilesInProgress } = get()
        if (typeof json === 'string') {
          try {
            console.log('WS: GOT MESSAGE', json)
            const { kind, data } = JSON.parse(json) as WsMessage;
            if (kind === 'progress') {
              const { name, progress } = data
              const fip = { ...filesInProgress, [name]: progress }
              console.log({ fip })
              setFilesInProgress(fip)
            } else if (kind === 'uploaded') {
              get().refreshFiles()
            }
          } catch (error) {
            console.error("Error parsing WebSocket message", error);
          }
        } else {
            console.log('WS: GOT BLOB', json)
        }
      },
      refreshFiles: () => {
        const { setFiles } = get()
        fetch(`${import.meta.env.BASE_URL}/files`)
          .then((response) => response.json())
          .then((data) => {
            try {
              setFiles(data.ListFiles)
            } catch {
              console.log("Failed to parse JSON files", data);
            }
          })
      },
      set,
      get,
    }),


    {
      name: 'file_transfer', // unique name
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    }
  )
)

export default useFileTransferStore