// Adicione estas linhas no início do seu script.js (após outras funções ou no topo):
const audioSucesso = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9bfae2.mp3'); // Som positivo
const audioErro = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9bfae2.mp3'); // Som negativo (pode trocar por outro link se quiser)

// Função para gerar ingresso
function gerarIngresso(nome, evento, fundo) {
    const codigoIngresso = Math.random().toString(36).substr(2, 10);

    const ingresso = {
        nome,
        evento,
        codigo: codigoIngresso,
        fundo // Salva o fundo escolhido junto ao ingresso
    };

    localStorage.setItem(codigoIngresso, JSON.stringify(ingresso));

    const ingressoGerado = document.getElementById('ingresso-gerado');
    ingressoGerado.innerHTML = `
    <div style="width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:16px;">
        <button onclick="imprimirIngresso()" style="margin-bottom:16px;">Imprimir Ingresso</button>
        <div id="area-impressao" style="
            display: flex; 
            align-items: center; 
            justify-content: center;
            border: 2px solid #333; 
            border-radius: 12px; 
            padding: 12px; 
            max-width: 380px; 
            width: 100%;
            background: #fff url('${fundo}') center center / cover no-repeat;
            background-repeat: no-repeat;
            background-size: cover;
            margin-bottom: 16px;
            box-sizing: border-box;
        ">
            <img src="logo.png" alt="Logo do Evento" style="width: 80px; height: 80px; object-fit: contain; margin-right: 16px; border-radius: 8px; border: 1px solid #ccc; background: #f9f9f9;">
            <div style="flex:1; color: #fff; font-weight: bold; text-shadow: 1px 1px 4px #000; display: flex; flex-direction: column; align-items: flex-start; justify-content: center;">
                <h3 style="margin-top:0; margin-bottom: 8px;">Ingresso</h3>
                <p style="margin: 2px 0;"><strong>Nome:</strong> ${nome}</p>
                <p style="margin: 2px 0;"><strong>Evento:</strong> ${evento}</p>
                <p style="margin: 2px 0;"><strong>Código:</strong> ${codigoIngresso}</p>
            </div>
            <div id="qrcode" style="margin-left: 16px; display: flex; align-items: center; border: 2px solid #fff; border-radius: 8px; background: #222; padding: 6px;"></div>
        </div>
    </div>
    `;

    // Gerar QR Code com as informações do ingresso
    const qrcodeDiv = document.getElementById('qrcode');
    qrcodeDiv.innerHTML = ""; // Limpa QR anterior
    new QRCode(qrcodeDiv, {
        text: codigoIngresso, // ou JSON.stringify(ingresso)
        width: 72,
        height: 72
    });
}

// Função para imprimir apenas o ingresso
function imprimirIngresso() {
    alert("Para que o fundo do ingresso apareça na impressão, marque a opção 'Imprimir fundos de gráficos' nas configurações da impressora.");
    const areaImpressao = document.getElementById('area-impressao');
    const style = areaImpressao.getAttribute("style") || "";

    const janela = window.open('', '', `width=600,height=900`);
    janela.document.write(`
        <html>
        <head>
            <title>Imprimir Ingresso</title>
            <style>
                @page {
                    size: A5 portrait;
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 0;
                    background: #222;
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                }
                #area-impressao {
                    ${style}
                    margin: 0 auto 0 auto !important;
                    box-sizing: border-box;
                }
                /* Esconde dados de validação na impressão */
                #resultado-validacao, #resultado-validacao * {
                    display: none !important;
                }
            </style>
        </head>
        <body>
            ${areaImpressao.outerHTML}
        </body>
        </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
}

// Função para validar ingresso
function validarIngresso(codigoIngresso) {
    // Busca o ingresso no localStorage
    const ingressoStr = localStorage.getItem(codigoIngresso);
    const resultadoValidacao = document.getElementById('resultado-validacao');

    if (ingressoStr) {
        const ingresso = JSON.parse(ingressoStr);

        if (ingresso.usado) {
            resultadoValidacao.innerHTML = `<p style="color:red;"><strong>Ingresso já utilizado!</strong></p>`;
            audioErro.play();
        } else {
            // Marca como usado e salva novamente
            ingresso.usado = true;
            localStorage.setItem(codigoIngresso, JSON.stringify(ingresso));
            // Cria uma cópia sem o campo 'usado'
            const { usado, codigo, ...ingressoSemUsadoECodigo } = ingresso;
            resultadoValidacao.innerHTML = `
                <p style="color:green;"><strong>Ingresso Válido!</strong></p>
            `;
            audioSucesso.play();
        }
    } else {
        resultadoValidacao.innerHTML = `<p style="color:red;"><strong>Ingresso Inválido!</strong></p>`;
        audioErro.play();
    }
}

function exportarIngressosParaExcel() {
    let csv = "Nome;Evento;Código;Usado\n";
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            const ingresso = JSON.parse(localStorage.getItem(key));
            if (ingresso && ingresso.nome && ingresso.evento && ingresso.codigo) {
                csv += `"${ingresso.nome}";"${ingresso.evento}";"${ingresso.codigo}";${ingresso.usado ? "Sim" : "Não"}\n`;
            }
        } catch (e) {
            // Ignora entradas que não são ingressos
        }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ingressos.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function apagarTodosIngressos() {
    if (confirm("Tem certeza que deseja apagar todos os ingressos?")) {
        // Remove apenas os ingressos (não limpa todo o localStorage)
        let chavesParaRemover = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            try {
                const ingresso = JSON.parse(localStorage.getItem(key));
                if (ingresso && ingresso.nome && ingresso.evento && ingresso.codigo) {
                    chavesParaRemover.push(key);
                }
            } catch (e) {}
        }
        chavesParaRemover.forEach(key => localStorage.removeItem(key));
        alert("Todos os ingressos foram apagados!");
        document.getElementById('ingresso-gerado').innerHTML = "";
    }
}

function abrirLeitorQrCode() {
    const leitorDiv = document.getElementById('leitor-qrcode');
    leitorDiv.innerHTML = ""; // Limpa leitor anterior

    const html5QrCode = new Html5Qrcode("leitor-qrcode");
    html5QrCode.start(
        { facingMode: "environment" }, // Usa a câmera traseira
        {
            fps: 10,
            qrbox: 250
        },
        (decodedText, decodedResult) => {
            // Quando ler o QR Code, valida o ingresso
            html5QrCode.stop();
            validarIngresso(decodedText);
        },
        (errorMessage) => {
            // Erros de leitura podem ser ignorados ou exibidos
        }
    ).catch((err) => {
        leitorDiv.innerHTML = "<p style='color:red;'>Erro ao acessar a câmera.</p>";
    });
}




