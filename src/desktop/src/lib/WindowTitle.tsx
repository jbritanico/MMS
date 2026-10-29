import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCurrentUser } from "./currentUser";
import { userLevelLabel } from "./UserPickerGate";

const APP_NAME = "Sprint MMS";

// Keeps the window title bar in step with who is signed in:
// "Sprint MMS | <user name> | <user level>". Before anyone is picked it is just "Sprint MMS".
function WindowTitle() {
  const { user } = useCurrentUser();
  const title = user ? `${APP_NAME} | ${user.name} | ${userLevelLabel(user.role)}` : APP_NAME;

  useEffect(() => {
    document.title = title;
    try {
      void getCurrentWindow().setTitle(title).catch(() => {});
    } catch {
      // Not running inside Tauri (plain browser): document.title above is enough.
    }
  }, [title]);

  return null;
}

export default WindowTitle;
