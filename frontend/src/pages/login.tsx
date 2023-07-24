import { ConfigurationProvider, Form } from "@slashid/react";
import { useLogin } from "react-admin";
import { Box, Container } from "@mui/material";

export const Login = () => {
  const login = useLogin();
  return (
    <ConfigurationProvider factors={[{ method: "email_link" }]}>
      <Container component="main" maxWidth="xs">
        <Box
          sx={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Form
            onSuccess={(user) => {
              login(user);
            }}
          />
        </Box>
      </Container>
    </ConfigurationProvider>
  );
}
