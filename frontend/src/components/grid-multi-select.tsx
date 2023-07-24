import { MenuItem, Select } from "@mui/material";
import { useGridApiContext } from "@mui/x-data-grid";

export const GridMultiSelect = (props: any) => {
  const { id, value, field } = props;
  const apiRef = useGridApiContext();

  const handleChange = (event: any) => {
    const eventValue = event.target.value;
    const newValue =
      typeof eventValue === "string" ? value.split(",") : eventValue;

    apiRef.current.setEditCellValue({
      id,
      field,
      value: newValue.filter((x: any) => x !== ""),
    });
  };

  return (
    <Select
      labelId="permission-select-label"
      id="permission-select"
      multiple
      value={value}
      onChange={handleChange}
      sx={{ width: "100%" }}
    >
      {props.options.map((option: any) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </Select>
  );
};
