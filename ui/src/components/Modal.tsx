import { FaX } from "react-icons/fa6"

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  onClose: () => void
}

const Modal: React.FC<Props> = ({ title, onClose, children }) => {
  return (
    <div className="flex fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 place-items-center place-content-center">
      <div className="flex flex-col rounded bg-black px-4 py-2 w-1/2">
        <div className="flex justify-items-center self-stretch">
          <h1 className="grow">{title}</h1>
          <FaX 
            className="cursor-pointer my-1"
            onClick={onClose}
          />
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal