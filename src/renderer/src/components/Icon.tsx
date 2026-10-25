import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowDown,
  faArrowUp,
  faBolt,
  faChevronDown,
  faChevronRight,
  faCircleInfo,
  faClockRotateLeft,
  faClone,
  faCopy,
  faDownload,
  faEllipsis,
  faFile,
  faFileCode,
  faFileImage,
  faFileLines,
  faFileZipper,
  faFloppyDisk,
  faFolder,
  faFolderOpen,
  faGauge,
  faGear,
  faHardDrive,
  faLink,
  faMagnifyingGlass,
  faMinus,
  faPenToSquare,
  faPlay,
  faPlus,
  faPowerOff,
  faRotateRight,
  faServer,
  faSliders,
  faTableCells,
  faTerminal,
  faTrash,
  faUpRightFromSquare,
  faUpload,
  faXmark,
  faChevronLeft,
  faArrowRightArrowLeft,
  faNetworkWired,
  faMicrochip,
  faCircleXmark,
  faCircleCheck,
  faHourglassHalf,
  faSquare,
  faListCheck,
  faWindowRestore,
  faRoute,
  faColumns,
  faGlobe
} from '@fortawesome/free-solid-svg-icons'

export const ICONS: Record<string, IconDefinition> = {
  arrowDown: faArrowDown,
  arrowUp: faArrowUp,
  bolt: faBolt,
  chevronDown: faChevronDown,
  chevronRight: faChevronRight,
  chevronLeft: faChevronLeft,
  info: faCircleInfo,
  history: faClockRotateLeft,
  clone: faClone,
  copy: faCopy,
  download: faDownload,
  more: faEllipsis,
  file: faFile,
  fileCode: faFileCode,
  fileImage: faFileImage,
  fileLines: faFileLines,
  fileZipper: faFileZipper,
  save: faFloppyDisk,
  folder: faFolder,
  folderOpen: faFolderOpen,
  gauge: faGauge,
  gear: faGear,
  drive: faHardDrive,
  link: faLink,
  search: faMagnifyingGlass,
  minus: faMinus,
  edit: faPenToSquare,
  play: faPlay,
  plus: faPlus,
  power: faPowerOff,
  refresh: faRotateRight,
  server: faServer,
  sliders: faSliders,
  layout: faTableCells,
  terminal: faTerminal,
  trash: faTrash,
  external: faUpRightFromSquare,
  upload: faUpload,
  x: faXmark,
  swap: faArrowRightArrowLeft,
  network: faNetworkWired,
  cpu: faMicrochip,
  error: faCircleXmark,
  ok: faCircleCheck,
  waiting: faHourglassHalf,
  stop: faSquare,
  tasks: faListCheck,
  window: faWindowRestore,
  route: faRoute,
  columns: faColumns,
  globe: faGlobe
}

export function Icon({
  name,
  className,
  style,
  size
}: {
  name: string
  className?: string
  style?: React.CSSProperties
  size?: number
}): JSX.Element {
  const def = ICONS[name] || faFile
  return (
    <FontAwesomeIcon
      icon={def}
      className={className}
      style={{ ...(size ? { width: size, height: size } : {}), ...style }}
    />
  )
}
