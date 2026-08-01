// postcss-mobile-forever 配置
// 将 px 自动转换为 vw/vh 单位，实现移动端适配
// 设计稿宽度：375px (iPhone 标准)
export default {
  plugins: {
    'postcss-mobile-forever': {
      // 设计稿宽度（px）
      viewportWidth: 375,
      // PC 端保持 375px 的移动版心，不再继续按视口放大
      maxDisplayWidth: 375,
      appSelector: '.pc-mobile-wrapper.is-pc .mobile-body',
      // 设计稿高度
      viewportHeight: 812,
      // 需要转换的 CSS 属性
      propList: ['*'],
      // 不转换的选择器
      selectorBlackList: ['.norem'],
      // 根元素字体大小不转换
      rootContainingBlockSelectorList: ['html'],
    },
  },
}
