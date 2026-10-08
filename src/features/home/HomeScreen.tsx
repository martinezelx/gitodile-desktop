import React from "react";
import { HomeLauncher, type HomeLauncherProps } from "./HomeLauncher";

export type HomeScreenProps = HomeLauncherProps;

export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  return <HomeLauncher {...props} />;
}
