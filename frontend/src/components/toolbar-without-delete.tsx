import { Toolbar, SaveButton } from "react-admin";

export const ToolbarWithoutDelete = (props: any) => (
  <Toolbar {...props}>
    <SaveButton />
  </Toolbar>
);
