import { Bell, DoorOpen } from "lucide-react";
import type { AppModule } from "../types";
import { OfficeAlertsSettings } from "./OfficeAlerts";
import { RequestBanner } from "./OfficeCards";
import { OfficeHomeWidget } from "./OfficeHomeWidget";
import { OfficePage } from "./OfficePage";

const REQUEST_ID = /^[\w-]{1,80}$/;

export const officeModule: AppModule = {
  id: "office",
  title: "Office",
  subtitle: "Presence & doorbell",
  description: "Check in when you’re at the office, see who’s inside, and ring the doorbell.",
  icon: "icon-bell.svg",
  route: "/office",
  routes: [
    { path: "/office", title: "Office", element: OfficePage },
    { path: "/moo", title: "Office", element: OfficePage },
  ],
  HomeWidget: OfficeHomeWidget,
  GlobalBanner: RequestBanner,
  profileSettings: [
    {
      view: "alerts",
      title: "Office alerts",
      label: "Office alerts",
      detail: "Cow sound and notifications",
      icon: <Bell size={20} />,
      Component: OfficeAlertsSettings,
    },
  ],
  helpTopics: [
    {
      id: "presence",
      title: "Office presence",
      label: "Office presence",
      detail: "Check in, help out and leave",
      icon: <DoorOpen size={20} />,
      steps: [
        [
          "Check in when you arrive",
          "Tap I’m in the office. Your teammates can now ask you to get the door; alerts are optional and never block check-in.",
        ],
        [
          "Leave whenever you need",
          "Tap I’m leaving on Office. There is no minimum stay. Presence clears at midnight in Rome if you forget to check out.",
        ],
      ],
      action: "Back to Office",
      destination: "/",
    },
    {
      id: "door",
      title: "Using the doorbell",
      label: "Using the doorbell",
      detail: "Ring, respond and confirm entry",
      icon: <Bell size={20} />,
      steps: [
        [
          "Outside? Ring once",
          "Ring the office sends a real request to members marked inside. If nobody is present, you cannot ring. You can leave the request page while waiting, or cancel your request.",
        ],
        [
          "Inside? Lend a hand",
          "Tap I’ll get the door. More than one teammate can respond. Go and open; you don’t need to confirm opening. If you can’t go, release it with I can’t go.",
        ],
        [
          "Confirm when you’re inside",
          "The arriving member taps I’m inside. This ends the request and checks them in automatically. They can leave again immediately.",
        ],
      ],
      action: "Back to Office",
      destination: "/",
    },
  ],
  helpLinks: [
    {
      id: "office-alerts",
      label: "Set up office alerts",
      detail: "Enable alerts → Test",
      icon: <Bell size={20} />,
      to: "/account?view=alerts",
    },
  ],
  nativeEvents: [
    {
      event: "bitpolito:request",
      handle: (detail, navigate) => {
        const id = (detail as { request?: unknown } | undefined)?.request;
        if (typeof id === "string" && REQUEST_ID.test(id)) navigate(`/moo?request=${id}`);
      },
    },
  ],
  onLaunch: (launch, navigate) => {
    if (launch.request && REQUEST_ID.test(launch.request)) {
      navigate(`/moo?request=${launch.request}`);
    }
  },
};
