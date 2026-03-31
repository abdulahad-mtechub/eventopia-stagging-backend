require("dotenv").config();
const app = require("./src/app");
const { setupDatabase } = require("./src/db/initDb");

const PORT = process.env.PORT || 3059;

async function startServer() {
  try {
    // await setupDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
}



startServer();