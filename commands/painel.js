const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Envia o painel de recrutamento no canal configurado."),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channelId = client.config.panelChannelId;
    if (!channelId) {
      return interaction.editReply("❌ `panelChannelId` não configurado em `config/config.json`.");
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.editReply("❌ Canal de painel não encontrado. Verifique o `panelChannelId`.");
    }

    const embed = new EmbedBuilder()
      .setTitle("ROTA — Solicitar SET | ROTA")
      .setDescription(
        "Clique no botão abaixo para preencher o formulário de solicitação de SET."
      )
      .setColor(0xfee75c)
      .setFooter({ text: "ROTA • Sistema de Solicitação de SET" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("solicitar_set")
        .setLabel("Solicitar SET")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📋")
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply(`✅ Painel enviado em <#${channelId}>.`);
  }
};
