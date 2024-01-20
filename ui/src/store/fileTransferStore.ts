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
}

interface ProgressMessage { name: string, progress: number }
type WsMessage = { kind: string, data: ProgressMessage }

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
            }
          } catch (error) {
            console.error("Error parsing WebSocket message", error);
          }
        } else {
            console.log('WS: GOT BLOB', json)
        //   const reader = new FileReader();

        //   reader.onload = function(event) {
        //     if (typeof event?.target?.result === 'string') {
        //       try {
        //         const { kind, data } = JSON.parse(event.target.result) as WsMessage;

        //         if (kind === 'game_update') {
        //           set({ games: { ...get().games, [data.id]: data } })
        //         }
        //       } catch (error) {
        //         console.error("Error parsing WebSocket message", error);
        //       }
        //     }
        //   };

        //   reader.readAsText(json);
        }
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