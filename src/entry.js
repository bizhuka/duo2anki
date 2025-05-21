import initSqlJs from 'sql.js';

// The `initSqlJs` function is globally provided by all of the main dist files if loaded in the browser.
// We must specify this locateFile function if we are loading a wasm file from anywhere other than the current html page's folder.
const config = {
    locateFile: filename => `/js/sql/${filename}` // Adjusted path to be absolute from the server root
};

var SQL; // Declare SQL in a scope accessible where needed

initSqlJs(config).then(function (sql) {
    //Create the database
    SQL = sql;
    // If you need it to be globally accessible on the window object for other scripts:
    window.SQL = sql; 
    console.log("sql.js initialized and ready. Global 'SQL' (and window.SQL) is now available.");
    // You can now use the SQL object, e.g., const db = new SQL.Database();
    // Example: try { const db = new SQL.Database(); console.log("DB created", db); } catch(e) { console.error("Error creating DB", e); }
});

// You might want to export SQL or a promise that resolves when SQL is ready if other modules need to import it.
// For example:
// let sqlJsPromise = initSqlJs(config).then(sql => {
//     window.SQL = sql; // for legacy global access if needed
//     return sql;
// });
// export { sqlJsPromise };

console.log('src/entry.js loaded');