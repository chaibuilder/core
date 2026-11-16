import { ImageIcon } from "@radix-ui/react-icons";
import { groupProps, registerChaiBlockProps, stylesProp } from "~/registry";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";
import { imageQualityProp } from "~/web-blocks/image-quality-prop";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iI2Q1ZDdkYSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIFBsYWNlaG9sZGVyPC90ZXh0Pjwvc3ZnPg==";

export type ImageBlockProps = {
  styles: ChaiStyles;
  image: string;
  alt: string;
  width: number;
  height: number;
  lazyLoading: boolean;
  mobileImage: string;
  assetId?: string;
  mobileWidth?: string;
  mobileHeight?: string;
  imageQuality?: string;
  highPriority?: boolean;
};

const ImageBlock = (props: ChaiBlockComponentProps<ImageBlockProps>) => {
  const {
    blockProps,
    image: rawImage,
    mobileImage,
    styles,
    alt,
    height,
    width,
    lazyLoading,
    mobileWidth,
    mobileHeight,
  } = props;

  const image = rawImage || PLACEHOLDER_IMAGE;

  return (
    <picture>
      {mobileImage && (
        <source srcSet={mobileImage} media="(max-width: 480px)" width={mobileWidth} height={mobileHeight} />
      )}
      <img
        {...blockProps}
        {...styles}
        src={image}
        alt={alt}
        loading={lazyLoading ? "lazy" : "eager"}
        width={width}
        height={height}
      />
    </picture>
  );
};

const Config = {
  type: "Image",
  description: "A image component",
  label: "Image",
  category: "core",
  icon: ImageIcon,
  group: "media",
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp("w-full h-full object-cover"),
      alt: {
        type: "string",
        title: "Alt text",
        default: "",
        ui: { "ui:placeholder": "Enter  alt text" },
      },
      ...groupProps({
        label: "Image",
        properties: {
          image: {
            type: "string",
            title: "Image",
            default: PLACEHOLDER_IMAGE,
            ui: { "ui:widget": "image" },
          },
          width: {
            type: "string",
            title: "Width",
            default: "",
            ui: { "ui:placeholder": "Enter width" },
          },
          height: {
            type: "string",
            title: "Height",
            default: "",
            ui: { "ui:placeholder": "Enter height" },
          },
          lazyLoading: {
            type: "boolean",
            title: "Lazy Load",
            default: true,
            description:
              "Off = load right away. Inside a Repeater only the first item loads right away; the rest stay lazy.",
          },
          // Marks the one image the first viewport paints last (the LCP image):
          // eager + fetchpriority=high. Off by default — several high-priority
          // images on one page slow each other down.
          highPriority: {
            type: "boolean",
            title: "High priority (LCP image)",
            default: false,
            description:
              "Loads right away at high priority, even with Lazy Load on. Use on one image per page: the largest one visible on first paint.",
          },
          // Controls how Vercel/next-image optimizes this image. "Off" serves the
          // original file untouched; the numbered tiers map to a next/image `quality`.
          // Kept in sync (by string value) with resolveImageQuality in
          // components/ui/image-quality.ts. The app render path (blocks/rsc/Image.tsx)
          // consumes it via resolveImageQuality; the SDK's editor-side <picture>/<img>
          // above renders a plain image and does not emit the next/image quality.
          imageQuality: imageQualityProp,
        },
      }),
      ...groupProps({
        label: "Mobile",
        defaultOpen: false,
        properties: {
          mobileImage: {
            type: "string",
            title: "Mobile Image",
            default: "",
            ui: { "ui:widget": "image" },
          },
          mobileWidth: {
            type: "string",
            title: "Mobile Width",
            default: "",
            ui: { "ui:placeholder": "Enter width" },
          },
          mobileHeight: {
            type: "string",
            title: "Mobile Height",
            default: "",
            ui: { "ui:placeholder": "Enter height" },
          },
        },
      }),
    },
  }),
  aiProps: ["alt"],
  i18nProps: ["alt", "image", "_imageId", "mobileImage", "_mobileImageId"],
};

export { ImageBlock as Component, Config };
