const config = {
  crons: [
    {
      path: "/api/cron/cloudprnt-availability",
      schedule: "*/10 * * * *"
    }
  ],
  ...(process.env.CLOUDPRNT_API_DISABLED === "1"
    ? {
        routes: [
          {
            src: "^/api/cloudprnt$",
            status: 404
          }
        ]
      }
    : {})
};

export default config;
