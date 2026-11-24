// 生成 4 份 Contoso Australia 模拟财务政策（Word），用于 SharePoint 知识源
// 陷阱位置：C 新旧版本（文档1 vs 2），D 例外条款放在附录（文档1），
// B 混淆（文档3 与文档1 结构相似、审批人不同），B 拼接（文档4 审批权限表）
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, HeadingLevel,
} = require("docx");

// ---------- 通用小工具 ----------
const p = (text) => new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(text)] });

const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };

// 表格：rows 第一行是表头；widths 单位 DXA，总和 = 9026（A4 去掉 1 英寸边距）
function table(rows, widths) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((cell, j) => new TableCell({
        borders,
        width: { size: widths[j], type: WidthType.DXA },
        shading: i === 0 ? { fill: "D9E2F3", type: ShadingType.CLEAR } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0 })] })],
      })),
    })),
  });
}

// 文档头：公司、政策编号、版本、生效日期、负责人
function header(title, id, version, effective, owner) {
  return [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    table([
      ["Field", "Detail"],
      ["Organisation", "Contoso Australia Pty Ltd"],
      ["Policy ID", id],
      ["Version", version],
      ["Effective date", effective],
      ["Policy owner", owner],
    ], [2600, 6426]),
    p(""),
  ];
}

function build(children) {
  return new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { font: "Arial", size: 36, bold: true }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 28, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 24, bold: true }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: "left", style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
}

// ---------- 国内差旅政策：现行版和旧版共用一个模板，只有数字和日期不同 ----------
function domestic(v) {
  return [
    ...header(`Domestic Travel Policy ${v.fy}`, "FIN-TRV-001", v.version, v.effective, "Chief Financial Officer"),
    h1("1. Purpose and scope"),
    p("This policy sets the rules for business travel within Australia by Contoso Australia employees and contractors. It explains what can be booked, what can be claimed and how claims are approved."),
    h1("2. Booking"),
    bullet("All flights and accommodation must be booked through the Contoso travel portal, TravelHub."),
    bullet("Economy class is the standard for all domestic flights."),
    bullet("Travel must be approved by your line manager before booking."),
    h1("3. Accommodation"),
    table([
      ["Location", "Maximum per night (incl. GST)"],
      ["Capital cities", v.accCapital],
      ["All other locations", v.accOther],
    ], [4513, 4513]),
    h1("4. Meals"),
    p(`Employees may claim actual meal costs up to ${v.meal} per day while travelling overnight. Alcohol is not reimbursable. Meals are not claimable for day trips with no overnight stay.`),
    h1("5. Ground transport"),
    bullet("Taxis and rideshare are claimable for travel between the airport, accommodation and business locations."),
    bullet(`Use of a private vehicle is reimbursed at ${v.km} per kilometre.`),
    h1("6. Claims"),
    bullet(`Claims must be submitted in the expense system within ${v.claimDays} days of the end of the trip.`),
    bullet("An itemised receipt is required for every item over $10."),
    bullet("Claims submitted late will not be reimbursed unless approved by the CFO."),
    h1("7. Expenses above policy limits"),
    p("Any expense above the limits in this policy must be approved in line with the Delegation of Authority (FIN-DOA-001). The approval level is based on the amount above the limit."),
    h1("Appendix A: Exceptions"),
    p(`A1. Remote locations: for overnight travel to locations listed as remote in the TravelHub location list, the meal limit in section 4 is increased to ${v.mealRemote} per day.`),
    p("A2. International travel: any trip that includes an international leg is covered by the International Travel Policy (FIN-TRV-002). This includes the domestic legs of that trip."),
  ];
}

const current = domestic({
  fy: "FY2027", version: "3.0", effective: "1 July 2026",
  accCapital: "$250", accOther: "$180", meal: "$60", mealRemote: "$80",
  km: "$0.85", claimDays: "30",
});
const old = domestic({
  fy: "FY2026", version: "2.0", effective: "1 July 2025",
  accCapital: "$220", accOther: "$160", meal: "$50", mealRemote: "$70",
  km: "$0.80", claimDays: "60",
});

// ---------- 国际差旅政策：结构与国内版相似，但超额审批另有规定 ----------
const international = [
  ...header("International Travel Policy", "FIN-TRV-002", "2.1", "1 July 2026", "Chief Financial Officer"),
  h1("1. Purpose and scope"),
  p("This policy covers any business trip by Contoso Australia employees and contractors that includes travel outside Australia, including the domestic legs of that trip."),
  h1("2. Booking and pre-trip approval"),
  bullet("All flights and accommodation must be booked through TravelHub."),
  bullet("Every international trip must be approved by the Department Head before booking."),
  bullet("Economy class is the standard. Business class may be booked for a single flight longer than 8 hours."),
  h1("3. Accommodation"),
  p("Employees may claim accommodation up to AUD $350 per night."),
  h1("4. Meals"),
  p("Employees may claim actual meal costs up to AUD $100 per day. Alcohol is not reimbursable."),
  h1("5. Claims"),
  bullet("Claims must be submitted within 30 days of returning to Australia."),
  bullet("Foreign currency amounts are converted to AUD at the rate shown on the employee's card statement."),
  h1("6. Expenses above policy limits"),
  p("Any expense above the limits in this policy must be approved by the Head of Finance, whatever the amount. For international travel, this section replaces the approval levels in the Delegation of Authority (FIN-DOA-001)."),
];

// ---------- 审批权限表：拼接题需要它 ----------
const doa = [
  ...header("Delegation of Authority", "FIN-DOA-001", "4.0", "1 July 2026", "Chief Financial Officer"),
  h1("1. Purpose"),
  p("This document sets out who can approve spending on behalf of Contoso Australia. No one may approve their own expenses."),
  h1("2. Expenses above policy limits"),
  p("Where a policy requires approval for an expense above its limit, the approver depends on the amount above the limit:"),
  table([
    ["Amount above the policy limit", "Approver"],
    ["Up to $500", "Line Manager"],
    ["$500.01 to $2,000", "Department Head"],
    ["Over $2,000", "Chief Financial Officer"],
  ], [4513, 4513]),
  h1("3. Purchase orders"),
  table([
    ["Purchase order value (excl. GST)", "Approver"],
    ["Up to $5,000", "Department Head"],
    ["$5,000.01 to $50,000", "Chief Financial Officer"],
    ["Over $50,000", "Chief Executive Officer"],
  ], [4513, 4513]),
  h1("4. Other rules"),
  bullet("Splitting a purchase or claim to stay under an approval level is not allowed."),
  bullet("If the approver is on leave, the approval moves to the next level up."),
];

const files = [
  ["Domestic_Travel_Policy_FY2027.docx", current],
  ["Domestic_Travel_Policy_FY2026.docx", old],
  ["International_Travel_Policy.docx", international],
  ["Delegation_of_Authority.docx", doa],
];
fs.mkdirSync("out", { recursive: true });
(async () => {
  for (const [name, body] of files) {
    fs.writeFileSync(`out/${name}`, await Packer.toBuffer(build(body)));
    console.log("wrote", name);
  }
})();
