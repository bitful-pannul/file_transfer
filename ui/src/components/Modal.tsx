import { FaX } from "react-icons/fa6"

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  onClose: () => void
}

const Modal: React.FC<Props> = ({ title, onClose, children }) => {
  return (
    <div className="flex fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 place-items-center place-content-center">
      <div className="flex flex-col rounded-lg bg-black px-8 py-4 w-1/2 min-w-[500px]">
        <div className="flex">
          <h1 className="grow">{title}</h1>
          <button
            className="icon self-start"
            onClick={onClose}
          >
            <FaX />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal