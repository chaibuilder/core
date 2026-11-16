import { FieldHelpProps, helpId } from "@rjsf/utils";

// A field's `ui:help`, styled like DescriptionFieldTemplate: rjsf's stock help block inherits the panel's body size.
const FieldHelpTemplate = ({ idSchema, help }: FieldHelpProps) => {
  if (!help) return null;
  return (
    <div id={helpId(idSchema)} className="mt-1.5 text-xs font-light leading-snug text-muted-foreground">
      {help}
    </div>
  );
};

export default FieldHelpTemplate;
