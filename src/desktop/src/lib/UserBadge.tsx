import { useCurrentUser } from "./currentUser";
import { userLevelLabel } from "./UserPickerGate";

// Signed-in user shown top-right on the Attention Required screens, as plain text:
// "Name | Role (Tier N)".
export default function UserBadge() {
  const { user } = useCurrentUser();
  if (!user) return null;
  return (
    <span className="user-badge">
      {user.name} | {userLevelLabel(user.role)}
    </span>
  );
}
