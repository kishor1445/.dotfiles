require("nvchad.configs.lspconfig").defaults()

local servers = { "qmlls" }

vim.lsp.config("qmlls", {
  cmd = { "/usr/lib/qt6/bin/qmlls" },
})

vim.lsp.enable(servers)
