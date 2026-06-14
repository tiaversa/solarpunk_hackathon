type LogoProps = {
  className?: string;
  title?: string;
};

/**
 * Green Quest wordmark, inlined from design/logo/Logo 3 (light) (1).svg.
 * Text renders with the Sixtyfour display font (loaded in the root layout via
 * --font-display). Colors are kept faithful to the source file.
 */
export function Logo({ className, title = "Green Quest" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 308 319"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        className="logo-leaf"
        d="M284,8L271.0389404296875,30.4501953125L262.398193359375,52.90069580078125C247.27685546875,99.8421630859375,275.359130859375,132.49713134765625,267.9481201171875,178.32464599609375L267.84326171875,179.4385986328125L267.795654296875,179.397216796875C264.558349609375,201.88885498046875,256.83349609375,227.451171875,245.11669921875,242.7076416015625C212.55859375,285.10198974609375,151.31103515625,290.7735595703125,120.30517578125,258.79620361328125C104.7052001953125,242.70770263671875,102.8780517578125,232.75439453125,98.2247314453125,218.21624755859375C84.607666015625,217.36102294921875,67.982177734375,220.2574462890625,52.8609619140625,210.05267333984375C34.9150390625,197.9415283203125,25.74365234375,178.3544921875,24.21826171875,157.14886474609375C22.569091796875,134.2193603515625,30.262451171875,108.87939453125,47.1776123046875,86.8543701171875C67.863525390625,59.9188232421875,115.5062255859375,44.73687744140625,143.58837890625,38.61407470703125L186.7919921875,28.4093017578125L284,8"
        fill="#2E3826"
      />
      <path
        className="logo-stroke"
        d="M96.064453125,199.847900390625C96.064453125,199.847900390625,111.185791015625,263.116943359375,67.982177734375,285.56732177734375C31.5201416015625,304.514404296875,26.938720703125,357,26.938720703125,357"
        fill="none"
        stroke="#2E3826"
        strokeWidth="23.2786"
      />
      <text
        x="41"
        y="155.7919397354126"
        dominantBaseline="ideographic"
        textLength="199.4546661376953"
        lengthAdjust="spacingAndGlyphs"
        fill="#E8F0D8"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "39.8947px",
          whiteSpace: "pre",
        }}
      >
        GREEN
      </text>
      <text
        className="logo-accent"
        x="63"
        y="198.255031347275"
        dominantBaseline="ideographic"
        textLength="184.9989471435547"
        lengthAdjust="spacingAndGlyphs"
        fill="#7AB050"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "35px",
          letterSpacing: "2px",
          whiteSpace: "pre",
        }}
      >
        Quest
      </text>
    </svg>
  );
}
