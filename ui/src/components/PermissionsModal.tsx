import { useEffect, useState } from "react";
import useFileTransferStore from "../store/fileTransferStore"
import Modal from "./Modal";
import { trimBasePathFromPath } from "../utils/file";
import { FaChevronDown, FaX } from "react-icons/fa6";
import classNames from "classnames";

export const PermissionsModal: React.FC = () => {
  const { knownNodes, permissions, setPermissionsModalOpen, editingPermissionsForPath, onChangePermissionsForNode } = useFileTransferStore();
  const [editingPermsForNode, setEditingPermsForNode] = useState('');

  const filePermissions = editingPermissionsForPath && permissions && permissions[trimBasePathFromPath(editingPermissionsForPath)]
  const fileHasExplicitAllowances = filePermissions && Object.keys(filePermissions).filter(k => filePermissions[k] === true).length > 0;
  const fileHasExplicitForbiddances = filePermissions && Object.keys(filePermissions).filter(k => filePermissions[k] === false).length > 0;
  const fileHasMixedPermissions = fileHasExplicitAllowances && fileHasExplicitForbiddances;

  useEffect(() => {
    setEditingPermsForNode('');
  }, [editingPermissionsForPath])

  const onChangePerm = (allow?: boolean) => {
    setEditingPermsForNode('');
    onChangePermissionsForNode(trimBasePathFromPath(editingPermissionsForPath), { node: editingPermsForNode, allow });
  }

  return <Modal 
    title={`Permissions: ${trimBasePathFromPath(editingPermissionsForPath)}`} 
    onClose={() => setPermissionsModalOpen(false)} 
  >
    {(fileHasExplicitAllowances || fileHasMixedPermissions) && <div 
      className="flex mt-4 px-2 py-1 rounded bg-white/10"
    >
      <h2 className="font-bold">
        Allowed Nodes
      </h2>
      <div className="flex flex-col ml-auto">
        {filePermissions && Object.entries(filePermissions).filter(([_, perm]) => perm).map(([node, _], i) => <div 
            className="flex place-items-center"
            key={i}
          >
          <code>{node}</code>
          <button 
            className="ml-auto clear"
            onClick={() => onChangePermissionsForNode(trimBasePathFromPath(editingPermissionsForPath), { node })}
          >
            <FaX />
          </button>
        </div>)}
      </div>
    </div>}
    {(fileHasExplicitForbiddances || fileHasMixedPermissions) && <div 
      className="flex mt-4 px-2 py-1 rounded bg-orange/10"
    >
      <h2 className="font-bold">
        Forbidden Nodes
      </h2>
      <div className="flex flex-col ml-auto">
        {filePermissions && Object.entries(filePermissions).filter(([_, perm]) => !perm).map(([node, _], i) => <div 
            className="flex place-items-center"
            key={i}
          >
          <code>{node}</code>
          <button 
            className="ml-auto clear"
            onClick={() => onChangePermissionsForNode(trimBasePathFromPath(editingPermissionsForPath), { node })}
          >
            <FaX />
          </button>
        </div>)}
      </div>
    </div>}
    {!filePermissions && <div className="px-2 py-1">No permissions... yet. File is accessible to all.</div>}
    <div className="flex flex-col mt-4">
      <h2 className="font-bold">Add permissions for node:</h2>
      <div className="flex place-items-center">
        <input type="text" 
          value={editingPermsForNode} 
          onChange={e => setEditingPermsForNode(e.target.value)} 
          placeholder="example-node.os"
        />
        {knownNodes.length > 0 && <>
          <span className="mx-2">or:</span>
          <select 
            className="grow w-full"
            value={editingPermsForNode}
            onChange={e => setEditingPermsForNode(e.target.value)}
          >
            <option value=''>Select a known node</option>
            {knownNodes.map(node => <option value={node.split('@')[0]} key={node.split('@')[0]}>{node.split('@')[0]}</option>)}
          </select>
        </>}
      </div>
      <hr className="w-full my-2"/>
      <div className="flex">
        <div className="flex flex-col place-items-center rounded bg-white/10 mr-1 py-1 px-2 w-1/2">
          <button 
            disabled={!editingPermsForNode}
            className={classNames("alt self-stretch mb-2", { '!bg-gray-500': !editingPermsForNode })}
            onClick={() => onChangePerm(true)}
          >
            Allow
          </button>
          <div>
            <span className="font-bold">Allowing</span> access restricts this file to only allowed nodes. 
            <br/>
            <span className="font-bold">All other nodes will be implicitly forbidden.</span>
          </div>
        </div>
        <div className="flex flex-col place-items-center rounded bg-white/10 ml-1 py-1 px-2 w-1/2">
          <button 
            disabled={!editingPermsForNode}
            className={classNames("self-stretch mb-2", { '!bg-gray-500': !editingPermsForNode })}
            onClick={() => onChangePerm(false)}
          >
            Forbid
          </button>
          <div>
            <span className="font-bold">Forbidding</span> access restricts this file from forbidden nodes.
            <br/>
            <span className="font-bold">All other nodes will be implicitly allowed.</span>
          </div>
        </div>
      </div>
    </div>
  </Modal>
}

