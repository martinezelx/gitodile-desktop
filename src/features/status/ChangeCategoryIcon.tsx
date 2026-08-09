import { ArrowRightLeft, FileMinus, FilePlus, Pencil, TriangleAlert } from "lucide-react";
import type { ChangeCategory } from "./domain";

export const CHANGE_CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};
