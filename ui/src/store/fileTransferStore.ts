import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface FileTransferStore {
  handleWsMessage: (message: string) => void
  set: (partial: FileTransferStore | Partial<FileTransferStore>) => void
}

// type WsMessage = { kind: string, data: any }

const useFileTransferStore = create<FileTransferStore>()(
  persist(
    (set, get) => ({
      games: {},
      handleWsMessage: (json: string | Blob) => {
        if (typeof json === 'string') {
          try {
            console.log('WS: GOT MESSAGE', json)
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
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
)

export default useFileTransferStore