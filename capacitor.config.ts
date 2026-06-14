import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.greenquest.app",
  appName: "Green Quest",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
