# Nuke the distribution folder entirely
rm -rf dist/

# Run the build again to generate a fresh target
npm run build

# Verify the new McpServer code is physically in the compiled file
grep -i "McpServer" dist/index.js
