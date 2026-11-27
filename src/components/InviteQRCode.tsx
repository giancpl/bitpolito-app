import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function InviteQRCode({ value }: { value: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      color: { dark: "#001CE0", light: "#ffffff" },
    })
      .then((uri) => {
        if (active) setImage(uri);
      })
      .catch(() => {
        if (active) setImage("");
      });
    return () => {
      active = false;
    };
  }, [value]);
  return image ? (
    <img
      src={image}
      alt="Personal invitation QR code"
      width={280}
      height={280}
      style={{ width: "100%", maxWidth: 280, height: "auto", alignSelf: "center" }}
    />
  ) : null;
}
