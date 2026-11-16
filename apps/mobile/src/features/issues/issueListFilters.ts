import { Atom } from "effect/reactivity";

export interface IssueListFilters {
  readonly labels: ReadonlyArray<string>;
  /** Kept with the name the picker showed, so the chip can say who without the candidates. */
  readonly assignee: { readonly login: string; readonly name: string | null } | null;
}

/** Shared by the list and the sheets that search a tracker for a label or person. */
export const issueListFiltersAtom = Atom.make<IssueListFilters>({
  labels: [],
  assignee: null,
}).pipe(Atom.keepAlive, Atom.withLabel("mobile:issues:list-filters"));
