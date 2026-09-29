import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  Web,
} from "sip.js";
import type { Session } from "sip.js";
import type { SipCredentials } from "@/entities/telephony";
import type { SipState } from "../types/telephone";

export function useSipPhone(audio: RefObject<HTMLAudioElement | null>) {
  const ua = useRef<UserAgent | null>(null);
  const registration = useRef<Registerer | null>(null);
  const session = useRef<Session | null>(null);
  const domain = useRef("");
  const generation = useRef(0);
  const [state, setState] = useState<SipState>("offline");
  const [error, setError] = useState<string | null>(null);
  const [mutedPlayback, setMutedPlayback] = useState(false);
  const closeMedia = () => session.current?.sessionDescriptionHandler?.close();
  useEffect(
    () => () => {
      generation.current++;
      session.current?.sessionDescriptionHandler?.close();
      void ua.current?.stop().catch(() => undefined);
      ua.current = null;
      session.current = null;
      registration.current = null;
    },
    [],
  );

  const attach = (call: Session) => {
    session.current = call;
    call.stateChange.addListener((next) => {
      if (session.current !== call) return;
      if (next === SessionState.Established) {
        setState("talking");
        const handler =
          call.sessionDescriptionHandler as Web.SessionDescriptionHandler;
        const stream = new MediaStream(
          handler
            .peerConnection!.getReceivers()
            .flatMap((r) => (r.track ? [r.track] : [])),
        );
        if (audio.current) {
          audio.current.srcObject = stream;
          void audio.current.play().catch(() => setMutedPlayback(true));
        }
      }
      if (next === SessionState.Terminated) {
        session.current = null;
        if (audio.current) audio.current.srcObject = null;
        setState(
          registration.current?.state === RegistererState.Registered
            ? "ready"
            : "offline",
        );
        setMutedPlayback(false);
      }
    });
  };
  const connect = async (credentials: SipCredentials) => {
    const previous = ua.current;
    generation.current++;
    session.current?.sessionDescriptionHandler?.close();
    session.current = null;
    registration.current = null;
    ua.current = null;
    if (previous) await previous.stop().catch(() => undefined);
    setError(null);
    setState("connecting");
    const current = ++generation.current;
    try {
      // Grant microphone permission while the student explicitly enables the phone.
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      microphone.getTracks().forEach((track) => track.stop());
      if (current !== generation.current) return;
      domain.current = credentials.domain;
      const uri = UserAgent.makeURI(
        `sip:${credentials.username}@${credentials.domain}`,
      );
      const agent = new UserAgent({
        uri,
        authorizationUsername: credentials.username,
        authorizationPassword: credentials.password,
        logLevel: "error",
        transportOptions: {
          server: (() => {
            const url = new URL(credentials.ws_url, window.location.href);
            if (url.protocol === "http:") url.protocol = "ws:";
            if (url.protocol === "https:") url.protocol = "wss:";
            return url.href;
          })(),
        },
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: { iceServers: [] },
        },
        delegate: {
          onInvite: (invitation) => {
            if (current !== generation.current || session.current) {
              void invitation.reject({ statusCode: 486 });
              return;
            }
            attach(invitation);
            setState("incoming");
          },
          onDisconnect: () => {
            if (current !== generation.current) return;
            session.current?.sessionDescriptionHandler?.close();
            session.current = null;
            if (audio.current) audio.current.srcObject = null;
            setState("offline");
            setError("Связь с телефонией потеряна. Подключитесь снова.");
          },
        },
      });
      ua.current = agent;
      const registerer = new Registerer(agent);
      registration.current = registerer;
      registerer.stateChange.addListener((next) => {
        if (current === generation.current && !session.current)
          setState(next === RegistererState.Registered ? "ready" : "offline");
      });
      await agent.start();
      if (current !== generation.current) {
        await agent.stop();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error("SIP registration timeout")),
          15000,
        );
        void registerer
          .register({
            requestDelegate: {
              onAccept: () => {
                window.clearTimeout(timer);
                resolve();
              },
              onReject: () => {
                window.clearTimeout(timer);
                reject(new Error("SIP registration rejected"));
              },
            },
          })
          .catch((cause) => {
            window.clearTimeout(timer);
            reject(cause);
          });
      });
    } catch (cause) {
      if (current !== generation.current) return;
      generation.current++;
      const failed = ua.current;
      ua.current = null;
      registration.current = null;
      closeMedia();
      session.current = null;
      void failed?.stop().catch(() => undefined);
      setState("offline");
      setError(
        "Не удалось подключить телефон. Проверьте разрешение микрофона и доступность АТС.",
      );
      throw cause;
    }
  };
  const dial = async () => {
    if (!ua.current || state !== "ready")
      throw new Error("Сначала подключите телефон");
    const uri = UserAgent.makeURI(`sip:9000@${domain.current}`)!;
    const call = new Inviter(ua.current, uri, {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
      },
    });
    attach(call);
    setState("dialing");
    await call.invite();
  };
  const accept = async () => {
    if (session.current instanceof Invitation)
      await session.current.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });
  };
  const hangup = async () => {
    const call = session.current;
    if (!call) return;
    if (call.state === SessionState.Established) await call.bye();
    else if (call instanceof Invitation) await call.reject();
    else if (call instanceof Inviter) await call.cancel();
  };
  const play = async () => {
    await audio.current?.play();
    setMutedPlayback(false);
  };
  return {
    state,
    error,
    connect,
    dial,
    accept,
    hangup,
    play,
    mutedPlayback,
  };
}
