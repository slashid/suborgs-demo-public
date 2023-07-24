import { Typography } from "@mui/material";
import { useEffect } from "react";
import { SimpleForm, TextInput, required } from "react-admin";
import { useFormContext } from "react-hook-form";

const NameInput = (props: any) => {
  const form = useFormContext();

  useEffect(() => {
    form.setValue("user.name", "");
  }, []);

  return <TextInput {...props} />;
};

export const MeForm = ({ toolbar }: { toolbar?: any }) => {
  return (
    <>
      <div style={{ paddingTop: "20px", paddingLeft: "20px" }}>
        <Typography variant="h5">
          Welcome to SlashID Content Management System!
        </Typography>
        <Typography variant="subtitle1">
          Before you get started, please tell us your name.
        </Typography>
      </div>
      <SimpleForm toolbar={toolbar}>
        <NameInput
          source="user.name"
          label="Full name"
          validate={[required()]}
          fullWidth
        />
      </SimpleForm>
    </>
  );
};
