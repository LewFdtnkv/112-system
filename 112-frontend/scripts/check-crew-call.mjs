// Real Asterisk smoke check. All accounts/media must belong to an isolated test database.
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const fixture = JSON.parse(
  await readFile(process.env.TELEPHONY_FIXTURE, "utf8"),
);
const speech = (await readFile(process.env.TELEPHONY_TEST_SPEECH)).toString(
  "base64",
);
const origin = process.env.PLAYWRIGHT_BASE_URL;
const output = "docs/screenshots/crew-calls";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--autoplay-policy=no-user-gesture-required",
    `--unsafely-treat-insecure-origin-as-secure=${origin}`,
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.addInitScript(
  ({ speech }) => {
    const OriginalPeer = window.RTCPeerConnection;
    window.__peers = [];
    window.RTCPeerConnection = class extends OriginalPeer {
      constructor(...args) {
        super(...args);
        window.__peers.push(this);
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(
        1,
        context.sampleRate,
        context.sampleRate,
      );
      silence.loop = true;
      silence.connect(destination);
      silence.start();
      // The microphone is silent until the test explicitly plays a recorded utterance.
      window.__say = async () => {
        const bytes = Uint8Array.from(atob(speech), (c) => c.charCodeAt(0));
        await context.resume();
        const source = context.createBufferSource();
        source.buffer = await context.decodeAudioData(bytes.buffer);
        source.connect(destination);
        source.start();
        return {
          state: context.state,
          duration: source.buffer.duration,
          track: destination.stream.getAudioTracks()[0].readyState,
        };
      };
      return destination.stream;
    };
  },
  { speech },
);
const results = {};
try {
  const login = await page.request.post(origin + "/api/v1/auth/login", {
    data: { username: "callcheck-student", password: "callcheck-student-123" },
  });
  const token = (await login.json()).access_token;
  async function state() {
    return (
      await page.request.get(
        origin + `/api/v1/telephony/attempts/${fixture.attempt}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();
  }
  async function until(check, label) {
    for (let i = 0; i < 60; i++) {
      const s = await state();
      if (check(s)) return s;
      await page.waitForTimeout(500);
    }
    throw Error("Timeout: " + label);
  }
  // A repeat starts a new assignment cycle; an old credited call must not satisfy it.
  const headers = { Authorization: `Bearer ${token}` };
  let attempt = await (
    await page.request.get(
      origin + `/api/v1/student/attempts/${fixture.attempt}`,
      { headers },
    )
  ).json();
  const crew = attempt.dds.crews.find((c) => c.crew_code === "fire-1");
  if (crew?.status === "assigned") {
    for (const status of ["cancelled", "assigned"]) {
      const response = await page.request.post(
        origin + `/api/v1/student/attempts/${fixture.attempt}/dds/crews`,
        {
          headers,
          data: {
            request_id: crypto.randomUUID(),
            revision: attempt.dds.revision,
            information_event_id: attempt.dds.information.id,
            crew_code: "fire-1",
            status,
          },
        },
      );
      if (!response.ok())
        throw Error("Could not reset isolated test assignment");
      attempt = await response.json();
    }
  }
  await page.goto(origin + "/login");
  await page.getByLabel("Логин").fill("callcheck-student");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("callcheck-student-123");
  await page.getByLabel("Пароль", { exact: true }).press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("login"));
  await page.goto(origin + `/student/sessions/${fixture.lesson}`);
  await page.getByRole("button", { name: "Продолжить обработку" }).click();
  await page.getByRole("button", { name: "Подключить гарнитуру" }).click();
  const callButton = page.getByRole("button", {
    name: "Позвонить",
    exact: true,
  });
  await callButton.waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Позвонить" && !b.disabled,
    ),
  );
  await page.waitForTimeout(350);
  await page.screenshot({ path: output + "/ready.png", fullPage: true });
  await callButton.click();
  const listening = await until(
    (s) => s.active_call?.dialogue?.phase === "listening",
    "greeting completed",
  );
  await page.waitForTimeout(2200);
  const silent = await state();
  if (
    silent.active_call?.dialogue?.phase !== "listening" ||
    silent.crew_calls[0].completed
  )
    throw Error("Silence was credited");
  results.silence = "not credited";
  await page.waitForTimeout(350);
  await page.screenshot({ path: output + "/listening.png", fullPage: true });
  results.connection = await page.evaluate(async () => {
    const pc = window.__peers.at(-1);
    return {
      ice: pc.iceConnectionState,
      connection: pc.connectionState,
      local: pc.localDescription.sdp.match(/a=candidate:.+/g),
      remote: pc.remoteDescription.sdp.match(/a=candidate:.+/g),
    };
  });
  results.microphone = await page.evaluate(() => window.__say());
  await page.waitForTimeout(4000);
  results.media = await page.evaluate(async () => {
    const stats = [...(await window.__peers.at(-1).getStats()).values()];
    return {
      received: stats.find((s) => s.type === "inbound-rtp")?.bytesReceived,
      sent: stats.find((s) => s.type === "outbound-rtp")?.bytesSent,
      receivedEnergy: stats.find((s) => s.type === "inbound-rtp")
        ?.totalAudioEnergy,
      microphoneEnergy: stats.find((s) => s.type === "media-source")
        ?.totalAudioEnergy,
      codecs: stats.filter((s) => s.type === "codec").map((s) => s.mimeType),
    };
  });
  if (
    !results.media.received ||
    !results.media.sent ||
    !(results.media.receivedEnergy > 0) ||
    !(results.media.microphoneEnergy > 0)
  )
    throw Error("Missing speech in RTP media");
  const currentId = listening.active_call.id;
  const done = await until(
    (s) =>
      s.calls.some(
        (c) =>
          c.id === currentId &&
          c.dialogue?.phase === "acknowledged" &&
          c.ended_at,
      ),
    "acknowledgment and automatic hangup",
  );
  if (!done.crew_calls[0].completed)
    throw Error("Crew notification not credited");
  results.dialogue = done.calls.find((c) => c.id === currentId);
  await page.getByText("Оповещение подтверждено", { exact: false }).waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: output + "/confirmed.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 1100 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: output + "/mobile.png", fullPage: true });
  results.passed = true;
  await writeFile(
    output + "/check.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: silent microphone not credited; real RTP speech; acknowledgment; automatic hangup; correct crew credited",
  );
} finally {
  await browser.close();
}
