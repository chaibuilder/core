import { DescriptionFieldProps } from "@rjsf/utils";

// rjsf's stock template renders an unstyled <p>, which inherits the panel's body size and
// dwarfs the field labels. Checkbox and array descriptions both render through this.
const DescriptionFieldTemplate = ({ id, description }: DescriptionFieldProps) => {
  if (!description) return null;
  return (
    <div id={id} className="field-description mb-1.5 text-xs font-light leading-snug text-muted-foreground">
      {description}
    </div>
  );
};

export default DescriptionFieldTemplate;
