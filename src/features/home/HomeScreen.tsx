import React from "react";
import { WelcomeScreen, type WelcomeRecentEntry } from "../overview";

export type HomeScreenProps = {
  isOpening: boolean;
  recentProjects: readonly WelcomeRecentEntry[];
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  onOpenRecentProject: (path: string) => void;
  onToggleFavouriteRecentProject: (path: string) => void;
  onForgetRecentProject: (path: string) => void;
  hasOpenProjects: boolean;
  playGreeting: boolean;
};

export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  return <WelcomeScreen {...props} />;
}
