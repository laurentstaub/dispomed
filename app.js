import express from "express";
import './library/config.js';
const app = express();
const PORT = process.env.PORT;

app.set("view engine", "pug");
app.set("views", "./views");

app.use(express.static("."));

app.get("/", (req, res) => {
  res.render("chart");
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
