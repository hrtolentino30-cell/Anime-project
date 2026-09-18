import Image from 'next/image';

export function Brand() {
  return <span className="brand"><Image className="brandLockup" src="/animori-lockup-horizontal.svg" alt="Animori" width={170} height={56} priority /></span>;
}
