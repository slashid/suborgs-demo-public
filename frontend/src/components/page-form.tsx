import { SimpleForm, TextInput, required, regex } from "react-admin";

export const PageForm = ({
  name,
  edit = false,
  toolbar,
}: {
  name?: string;
  edit?: boolean;
  toolbar?: any;
}) => {
  return (
    <SimpleForm toolbar={toolbar}>
      <TextInput
        source="id"
        label="Page name"
        validate={[
          required(),
          edit
            ? undefined
            : regex(
                /^[a-zA-Z0-9_-]*$/,
                "May only contain alphanumeric characters, underscore and hypen. e.g. foo-bar_baz-123"
              )
        ]}
        fullWidth
        disabled={edit}
        defaultValue={name}
      />
      <TextInput
        source="raw"
        label="Background colour"
        validate={[
          regex(
            /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
            "Must be a valid hex colour code e.g. #000 or #000000"
          ),
        ]}
      />
    </SimpleForm>
  );
};
