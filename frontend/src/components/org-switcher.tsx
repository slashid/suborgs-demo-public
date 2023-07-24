import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useEffect, useState } from "react";

export const OrgSwitcher = ({
  value,
  orgs,
  onSelect,
  label,
}: {
  value: string;
  orgs: string[];
  label: string;
  onSelect: (org: string) => void;
}) => {
  const [org, setOrg] = useState<string>(value);

  useEffect(() => {
    if (value === org) {
      return;
    }

    onSelect(org);
  }, [org]);

  return (
    <FormControl style={{ maxWidth: "200px", width: "100%" }}>
      <InputLabel id="org-selector-label">{label}</InputLabel>
      <Select
        labelId="org-selector-label"
        id="org-selector"
        value={value}
        label={label}
        onChange={(e) => setOrg(e.target.value ?? "")}
      >
        {orgs &&
          orgs.map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
      </Select>
    </FormControl>
  );
};
