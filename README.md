# 点群データの効果的なリダクション手法についての研究 — 研究管理マスタ

研究管理ページの公開版です。公開用に選んだHTML・比較図・根拠資料と、進捗同期用のクライアントだけを収録しています。

進捗は研究専用のSupabaseに保存します。公開ページは閲覧可能で、編集は登録済みの管理者だけに許可します。PC・スマホで同じ進捗を更新できます。旧ブラウザー保存のチェックは、管理者が差分を確認して引き継げます。

Supabase公式クライアント 2.117.3（MIT）を同梱しています。ライセンスは research-master/vendor/SUPABASE-LICENSE と THIRD-PARTY-LICENSES.txt を参照してください。

## 図の出典と利用条件

比較図の元データ：ArCH dataset, Matrone et al. (2020), https://archdataset.polito.it/ 、https://doi.org/10.5194/isprs-archives-XLIII-B2-2020-1419-2020 。

原点群から部分抽出・間引き・可視化して作成した2点の比較図 (`assets/architecture-overview.png`, `assets/architecture-detail.png`) は原データと同じ CC BY-NC-SA 4.0 条件です： https://creativecommons.org/licenses/by-nc-sa/4.0/ 。非商用利用・出典表示・継承条件を守ってください。図の色は形状特徴や保持方式であり、正しい部材ラベルではありません。

窓扉の診断図 `assets/window-spatial-errors.png` は同じArCHの点群・色・クラスラベルと本研究の予測を用いた可視化で、CC BY-NC-SA 4.0条件を継承します。`window-error-breakdown.png`、`window-feature-distributions.png`、`window-ablation.png` は同データの独自集計図です。これら4図もCC BY-NC-SA 4.0で提供します。前の形状比較図とは凡例が異なり、診断図の正解ラベルはデータセットの注釈です。人手で再確認した実物の真値ではありません。

生の点群データ、個人の作業パス、動画台本、非公開プロジェクトの履歴は収録していません。研究の成果・未検証事項はページ本文を参照してください。
