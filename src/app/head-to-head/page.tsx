import { redirect } from "next/navigation";

// Player Stats and Head to Head were merged into one page — old links/
// bookmarks to this route still land somewhere useful.
export default function HeadToHeadRedirect() {
  redirect("/players");
}
