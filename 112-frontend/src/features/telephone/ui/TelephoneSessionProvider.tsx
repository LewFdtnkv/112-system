import { useRef, type PropsWithChildren } from "react";
import { useSipPhone } from "../model/useSipPhone";
import { TelephoneSessionContext } from "../model/TelephoneSessionContext";

/** One browser SIP connection survives switching or closing incident dialogs. */
export function TelephoneSessionProvider({ children }: PropsWithChildren) {
  const audio = useRef<HTMLAudioElement>(null);
  const phone = useSipPhone(audio);
  return (
    <TelephoneSessionContext.Provider value={phone}>
      <audio ref={audio} autoPlay />
      {children}
    </TelephoneSessionContext.Provider>
  );
}
