import { TextField, TextFieldProps } from "@material-ui/core";

export default function NumberTextField({
  ...props
}: TextFieldProps) {
  return (
    <TextField
      inputProps={{ pattern: "^[0-9]*[.]?[0-9]*$" }}
      type="text"
      {...props}
      InputProps={{
        ...(props?.InputProps || {}),
      }}
    ></TextField>
  );
}
