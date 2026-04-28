import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import type { ReactElement, ReactNode } from "react";
import { DvcSchema } from "./schema";

export const dvcEvolu = createEvolu(evoluReactWebDeps)(DvcSchema, {
  name: SimpleName.orThrow("dvc-community"),
});

export const useDvcEvolu = createUseEvolu(dvcEvolu);

export const DvcEvoluProvider = (props: { children: ReactNode }): ReactElement => {
  return <EvoluProvider value={dvcEvolu}>{props.children}</EvoluProvider>;
};
