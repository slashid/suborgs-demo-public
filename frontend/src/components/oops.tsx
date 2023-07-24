const centeredStyles = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  fontSize: "24px",
};

export const Oops = ({ message = "There was an issue loading this page" }) => {
  return (
    <div style={centeredStyles}>
      <div>{message}</div>
    </div>
  );
};
