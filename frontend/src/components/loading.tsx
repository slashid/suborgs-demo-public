import { LinearProgress } from "react-admin";

const centeredStyles = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
};

export const Loading = ({ center = false }) => {
  return (
    <div style={center ? centeredStyles : undefined}>
      <LinearProgress />
    </div>
  );
};
