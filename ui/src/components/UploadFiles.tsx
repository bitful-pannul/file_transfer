import { useState } from "react";
import useFileTransferStore from "../store/fileTransferStore";
import { FaX } from "react-icons/fa6";
import { getReadableFilesize } from "../utils/file";

const UploadFiles = () => {
  const { errors, setErrors, refreshFiles } = useFileTransferStore();

  const [filesToUpload, setFilesToUpload] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  
  const onAddFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFilesToUpload(Array.from(event.target.files))
    }
  }

  const onUploadFiles = () => {
    const formData = new FormData()
    filesToUpload.forEach((file) => {
      formData.append('files', file)
    })
    setIsUploading(true)

    fetch(`${import.meta.env.BASE_URL}/files`, {
      method: 'POST',
      body: formData,
    })
      .then(() => {
        refreshFiles()
        setFilesToUpload([])
      })
      .catch((_err: any) => {
        setErrors([...errors, "There was an error uploading files."])
      })
      .finally(() => {
        setIsUploading(false)
      })
  }

  const onRemoveFileToUpload = (file: File) => {
    if (!window.confirm(`Are you sure you want to remove ${file.name}?`)) return
    setFilesToUpload((files) => files.filter((f) => f !== file))
  }

  return (
    <div className='flex place-content-center place-items-center px-2 py-1 relative'>
      <h3 className='text-xl px-2 py-1'>Upload</h3>
      <div className='flex flex-col px-2 py-1'>
        {filesToUpload.length === 0 && <label htmlFor='files' className="button">
          Choose Files
          <input id='files' type='file' hidden multiple onChange={onAddFiles} />
        </label>}

        {filesToUpload.length > 0 && (
          <div className='flex flex-col px-2 py-1'>
            <ul className="flex flex-col items-start">
              {filesToUpload.map((file) => (
                <li 
                  key={file.name}
                  className="flex mb-2 px-8 py-2 place-items-center rounded rounded-full hover:bg-white/20 bg-white/10 cursor-pointer"
                  onClick={() => onRemoveFileToUpload(file)}
                >
                  <FaX className="text-xs" />
                  <span className="pl-4">{file.name}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col px-2 py-1 text-center mb-2">
              <span>{filesToUpload.length} files selected</span>
              <span>Total: {getReadableFilesize(filesToUpload.reduce((acc, file) => acc + file.size, 0))}</span>
            </div>
            <div className="flex self-center">
              <button 
                className='alt mr-2' 
                onClick={() => setFilesToUpload([])}
              >  
                Clear
              </button>
              <button 
                className="ml-2"
                onClick={onUploadFiles}
              >
                Upload
              </button>
            </div>
          </div>
        )}
      </div>
      {isUploading && <div className="absolute top-0 bottom-0 left-0 right-0 bg-black/30 flex place-items-center place-content-center">
        <span className="text-white">Uploading...</span>
      </div>}
    </div>
  )
}

export default UploadFiles;