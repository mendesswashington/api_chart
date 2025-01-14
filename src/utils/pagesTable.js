

// Função para dividir linhas da tabela
function paginateTableRows(rows, maxRowsPerPage) {
    const paginatedRows = [];
    for (let i = 0; i < rows.length; i += maxRowsPerPage) {
        paginatedRows.push(rows.slice(i, i + maxRowsPerPage));
    }
    return paginatedRows;
};

module.exports = paginateTableRows;