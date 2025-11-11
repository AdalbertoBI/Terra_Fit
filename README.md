# Hidrate+

Hidrate+ é uma Progressive Web App (PWA) em português do Brasil que calcula a necessidade hídrica diária personalizada, envia lembretes inteligentes e acompanha o histórico de ingestão. O aplicativo funciona offline, pode ser instalado no smartphone e foi projetado para uma experiência leve, responsiva e acessível.

## 📱 Funcionalidades principais

- Cadastro e edição rápida de perfil com nome, idade, sexo, peso, altura e nível de atividade.
- Cálculo automático da meta diária em mililitros e copos (200 ml), com ajustes para idade avançada e nível de atividade.
- Barra de progresso dinâmica, mensagens motivacionais e botão "Bebi agora" para registrar cada ingestão.
- Alertas configuráveis via Notifications API que funcionam offline quando o app é instalado como PWA.
- Histórico diário persistente (localStorage) e gráfico semanal de barras desenhado em Canvas.
- Service Worker para cache offline, manifest configurado e instalação via atalho na tela inicial.
- Modo escuro com alternância em tempo real e persistência da preferência.
- Contador de passos opcional usando sensores de movimento do dispositivo, com integração experimental via Web Bluetooth para smartwatches.

## 🧮 Cálculos baseados em evidências científicas

A meta hídrica é calculada com base em recomendações de organizações de referência:

1. **Volume basal:** peso corporal (kg) × 35 ml  
   Referências: Organização Mundial da Saúde (OMS) e American College of Sports Medicine (ACSM).
2. **Fator por nível de atividade:**

| Nível | Multiplicador | Adicional fixo |
|-------|---------------|----------------|
| Sedentário | × 1.0 | + 0 ml |
| Ativo | × 1.1 | + 500 ml |
| Atleta | × 1.2 | + 1000 ml |

3. **Ajuste para idade avançada:** redução progressiva de 1% ao ano acima dos 55 anos, limitada a 20% (literatura médica sobre mudanças fisiológicas e risco de hiponatremia em idosos).

O resultado final é exibido em mililitros e convertido em copos de 200 ml (arredondado para cima). Um histórico detalhado mantém as ingestões diárias para análise semanal.

### Referências científicas e diretrizes consultadas

- Organização Mundial da Saúde. *Guidelines on adequate hydration* (2020).
- American College of Sports Medicine. *Position stand on exercise and fluid replacement* (2016).
- Institute of Medicine (IOM). *Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate* (2005).
- Kenney, W. L., & Chiu, P. (2001). *Influence of age on thirst and fluid intake*. Medicine & Science in Sports & Exercise.
- Sawka, M. N., et al. (2007). *American College of Sports Medicine position stand. Exercise and fluid replacement*. Medicine & Science in Sports & Exercise.

## 🗂️ Estrutura do projeto

```
/
├── index.html               # Layout principal, formulários e cartões de status
├── manifest.json            # Configuração PWA (nome, ícones, tema)
├── service-worker.js        # Cache offline, atualização e notificações
├── assets/
│   ├── css/style.css        # Estilos responsivos, modo claro/escuro
│   ├── js/
│   │   ├── app.js           # Lógica principal, UI, lembretes, pedômetro
│   │   ├── utils.js         # Funções auxiliares (formatação, mensagens)
│   │   ├── storage.js       # Persistência no localStorage
│   │   ├── calculations.js  # Fórmulas de hidratação
│   │   ├── notifications.js # Gestão de permissões e agendamento
│   │   └── chart.js         # Renderização do gráfico semanal em Canvas
│   └── img/icons/           # Ícones SVG para manifest e atalhos
└── README.md
```

## 🚀 Como executar localmente

1. Faça o download ou clone este repositório.
2. Sirva os arquivos via HTTP (requisito para PWA e notificações). Você pode usar qualquer servidor estático, por exemplo:

```bash
npx serve .
```

3. Acesse `http://localhost:3000` (ou a porta indicada) no navegador.
4. Cadastre seu perfil, conceda permissão para notificações e adicione o app à tela inicial se desejar.

> **Observação:** Para que notificações funcionem, é necessário usar HTTPS ou `http://localhost`. O contador de passos depende dos sensores disponíveis no dispositivo e pode requerer permissão explícita em iOS (Safari).

## 🌐 Publicação no GitHub Pages

1. Crie um repositório público e envie todos os arquivos deste projeto.
2. No GitHub, abra **Settings → Pages** e selecione a branch com os arquivos (por exemplo, `main`) e o diretório raiz `/`.
3. Aguarde a publicação. O aplicativo ficará disponível em `https://<usuario>.github.io/<repositório>/`.
4. Atualize as configurações de domínio se usar um CNAME personalizado.

O `service-worker.js` utiliza caminhos relativos, garantindo que o cache funcione corretamente mesmo quando o repositório é publicado em um subdiretório do GitHub Pages.

## 🔒 Armazenamento e privacidade

- Todos os dados pessoais, histórico de consumo e passos ficam apenas no navegador do usuário (localStorage).
- Nenhuma informação é enviada a servidores externos.
- As permissões de notificações e sensores podem ser revogadas a qualquer momento nas configurações do navegador.

## 📈 Recursos adicionais

- **Modo escuro** persistente com alternância instantânea.
- **Gráfico semanal**: barras comparativas com linha de meta diária.
- **Mensagens motivacionais** dinâmicas conforme o progresso.
- **Contador de passos** baseado na Web Sensor API, com opção de zerar e conexão experimental a smartwatches via Web Bluetooth.

## ✅ Próximos passos sugeridos

- Implementar sincronização opcional na nuvem (ex.: Firebase) mantendo o foco em privacidade.
- Adicionar notificações avançadas via Background Sync e Channel Messaging.
- Disponibilizar relatórios mensais exportáveis em PDF ou CSV.

---

Desenvolvido para promover hábitos saudáveis de hidratação com base em ciência e tecnologia acessível. 💧
