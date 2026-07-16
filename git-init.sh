touch README.md &&
git init &&
git checkout -b main &&
git add README.md &&
git commit -m "first commit" &&
git remote add origin git@192.168.0.65:nater/guardrail-mcp-validator.git &&
git push -u origin main
