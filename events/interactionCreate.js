const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { assertAllowed } = require("../utils/permissions");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeReply(interaction, options) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(options).catch(() => {});
  }
  return interaction.reply(options).catch(() => {});
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleSlashCommand(client, interaction) {
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    assertAllowed(interaction, client.config);
    await cmd.execute(client, interaction);
  } catch (err) {
    if (err?.code === "FORBIDDEN") {
      return safeReply(interaction, {
        content: "🚫 Você não tem permissão para usar este comando.",
        ephemeral: true
      });
    }
    console.error("[SLASH]", err);
    return safeReply(interaction, {
      content: "❌ Ocorreu um erro ao executar o comando.",
      ephemeral: true
    });
  }
}

async function handleButton(client, interaction) {
  const { customId } = interaction;

  // ── Botão: abrir modal de inscrição ─────────────────────────────────────────
  if (customId === "solicitar_set") {
    const modal = new ModalBuilder()
      .setCustomId("modal_solicitar_set")
      .setTitle("Solicitação de SET — ROTA");

    const nomeInput = new TextInputBuilder()
      .setCustomId("campo_nome")
      .setLabel("Nome completo (RP)")
      .setPlaceholder("Ex: João da Silva")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);

    const idadeInput = new TextInputBuilder()
      .setCustomId("campo_idade")
      .setLabel("Idade")
      .setPlaceholder("Ex: 22")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nomeInput),
      new ActionRowBuilder().addComponents(idadeInput)
    );

    return interaction.showModal(modal);
  }

  // ── Botões: Aprovar / Reprovar ───────────────────────────────────────────────
  if (customId.startsWith("aprovar_") || customId.startsWith("reprovar_")) {
    const isAprovado = customId.startsWith("aprovar_");
    const userId = customId.replace(/^(aprovar_|reprovar_)/, "");

    try {
      assertAllowed(interaction, client.config);
    } catch {
      return interaction.reply({
        content: "🚫 Você não tem permissão para realizar esta ação.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    const responsible = interaction.user;
    const originalEmbed = interaction.message.embeds[0];

    const statusLabel = isAprovado ? "✅ APROVADO" : "❌ REPROVADO";
    const statusColor = isAprovado ? 0x57f287 : 0xed4245;

    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(statusColor)
      .setFooter({
        text: `${statusLabel} por ${responsible.username} • ${new Date().toLocaleString("pt-BR")}`
      });

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("_noop_aprovar")
        .setLabel("Aprovar")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("_noop_reprovar")
        .setLabel("Reprovar")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] });

    const changes = [];

    // ── Se aprovado: seta cargos e apelido ──────────────────────────────────
    if (isAprovado) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

        // Pega o Nome RP do embed da solicitação
        const nomeField = originalEmbed.fields?.find((f) => f.name.includes("Nome RP"));
        const nomeRP = nomeField?.value?.trim() || member.displayName;

        // Seta cargos configurados em onApprove.roleIds
        const configuredRoleIds = client.config.onApprove?.roleIds ?? [];
        if (configuredRoleIds.length) {
          const resolved = await Promise.all(
            configuredRoleIds.map(async (id) => interaction.guild.roles.fetch(id).catch(() => null))
          );
          const roles = resolved.filter(Boolean);
          const missing = configuredRoleIds.filter((id) => !roles.some((r) => r.id === id));

          const notEditable = roles.filter((r) => !r.editable);
          const addable = roles.filter((r) => r.editable);

          if (missing.length) {
            const missingFmt = missing.map((id) => "`" + id + "`").join(", ");
            changes.push(`- Cargo(s) não encontrado(s): ${missingFmt}`);
          }
          if (notEditable.length) {
            const details = notEditable
              .map((r) => `@${r.name} (managed=${r.managed}, pos=${r.position})`)
              .join(", ");
            changes.push(
              `- Cargo(s) bloqueado(s) p/ bot (não editável). Bot pos=${botMember.roles.highest.position}. ${details}`
            );
          }
          if (!addable.length) {
            changes.push("- Nenhum cargo pôde ser adicionado (todos não editáveis para o bot).");
          } else {
            const roleIds = addable.map((r) => r.id);
            try {
              await member.roles.add(roleIds, "ROTA: aprovação de SET");
              const addedFmt = addable.map((r) => "@" + r.name).join(", ");
              changes.push(`- ${roleIds.length} cargo(s) adicionado(s): ${addedFmt}`);
            } catch (e) {
              if (e?.code === 50013) {
                changes.push(
                  "- Missing Permissions ao adicionar cargos. Verifique: cargo do BOT acima dos cargos alvo, e acima do membro (maior cargo do membro), e permissão 'Gerenciar Cargos'."
                );
              } else {
                throw e;
              }
            }
          }
        }

        // Monta e aplica o apelido
        const template = client.config.onApprove?.nicknameTemplate ?? "{nome}";
        const nickname = template.replaceAll("{nome}", nomeRP);
        try {
          await member.setNickname(nickname, "ROTA: aprovação de SET (apelido)");
          changes.push(`- Apelido: ${nickname}`);
        } catch (e) {
          if (e?.code === 50013) {
            changes.push(
              "- Missing Permissions ao alterar apelido. Verifique: permissão 'Gerenciar Apelidos' e se o cargo do BOT está acima do membro."
            );
          } else {
            changes.push("- Apelido não alterado (sem permissão/hierarquia)");
          }
        }
      } catch (err) {
        console.error("[APROVAR]", err);
        changes.push("- Erro ao aplicar cargos/apelido");
      }
    }

    // ── DM ao candidato ─────────────────────────────────────────────────────
    let dmEnviada = false;
    try {
      const candidato = await client.users.fetch(userId);
      const dmMsg = isAprovado
        ? "✅ **Sua solicitação de SET na ROTA foi APROVADA!**\n\nParabéns! Em breve você receberá as orientações necessárias."
        : "❌ **Sua solicitação de SET na ROTA foi REPROVADA.**\n\nNão desanime! Você poderá tentar novamente futuramente.";
      await candidato.send(dmMsg);
      dmEnviada = true;
    } catch {
      dmEnviada = false;
    }

    const changesText = changes.length ? `\n${changes.join("\n")}` : "";
    await interaction.followUp({
      content:
        `${statusLabel} para <@${userId}>.${changesText}\n` +
        (dmEnviada ? "📨 DM enviada ao candidato." : "⚠️ Não consegui enviar DM (usuário com DMs fechadas)."),
      ephemeral: true
    });

    return;
  }
}

async function handleModalSubmit(client, interaction) {
  if (interaction.customId !== "modal_solicitar_set") return;

  await interaction.deferReply({ ephemeral: true });

  const nomeRP = interaction.fields.getTextInputValue("campo_nome");
  const idade = interaction.fields.getTextInputValue("campo_idade");
  const candidato = interaction.user;

  const requestsChannelId = client.config.requestsChannelId;
  if (!requestsChannelId) {
    return interaction.editReply("❌ `requestsChannelId` não configurado em `config/config.json`.");
  }

  const requestsChannel = await interaction.guild.channels.fetch(requestsChannelId).catch(() => null);
  if (!requestsChannel) {
    return interaction.editReply("❌ Canal de solicitações não encontrado.");
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Nova Solicitação de SET")
    .setColor(0xfee75c)
    .setThumbnail(candidato.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 Usuário", value: `<@${candidato.id}> (\`${candidato.username}\`)`, inline: false },
      { name: "🪪 Nome RP", value: nomeRP, inline: true },
      { name: "🎂 Idade", value: idade, inline: true }
    )
    .setFooter({ text: `ID: ${candidato.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aprovar_${candidato.id}`)
      .setLabel("Aprovar")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`reprovar_${candidato.id}`)
      .setLabel("Reprovar")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
  );

  await requestsChannel.send({ embeds: [embed], components: [row] });

  await interaction.editReply(
    "✅ Sua solicitação foi enviada com sucesso!\nAguarde a análise da equipe — você será avisado por DM."
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) return handleSlashCommand(client, interaction);
      if (interaction.isButton()) return handleButton(client, interaction);
      if (interaction.isModalSubmit()) return handleModalSubmit(client, interaction);
    } catch (err) {
      console.error("[interactionCreate]", err);
    }
  }
};
