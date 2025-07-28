import React, { Component } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  ToastAndroid,
  Platform,
} from 'react-native';
import HtmlView from 'react-native-htmlview';
import { Text, Snackbar } from 'react-native-paper';
import PXTabView from './PXTabView';
import PXCacheImage from './PXCacheImage';
import { MODAL_TYPES } from '../common/constants';
import { globalStyleVariables } from '../styles';
import {
  ReadingSession,
  ReadingProgressAutoSave,
  debounce,
  restoreScrollPosition,
} from '../common/helpers/readingProgressUtils';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: globalStyleVariables.WINDOW_WIDTH,
    padding: 10,
  },
  novelChapter: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  pageLink: {
    fontWeight: '500',
    color: '#007AFF',
  },
  novelImage: {
    width: '100%',
    height: 250,
    marginVertical: 10,
    resizeMode: 'contain',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    zIndex: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 10,
  },
  progressText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
});

class NovelViewer extends Component {
  constructor(props) {
    super(props);
    const { items, index, novelId } = props;
    this.state = {
      // eslint-disable-next-line react/no-unused-state
      index,
      routes: items.map((item, i) => ({
        key: i.toString(),
      })),
      showResumeNotification: false,
      resumeMessage: '',
    };

    // Reading progress tracking
    this.scrollViewRefs = {};
    this.readingSession = null;
    this.autoSave = null;
    this.lastScrollPosition = 0;
    this.lastScrollPercentage = 0;
    this.lastChapterIndex = index || 0;

    // Debounced scroll handler to avoid excessive updates
    this.debouncedScrollHandler = debounce(
      this.handleScrollProgress.bind(this),
      300, // Reduced from 500ms for more responsive progress tracking
    );
  }

  componentDidMount() {
    const { novelId, onSaveProgress, initialProgress } = this.props;

    // Initialize reading session
    if (novelId) {
      this.readingSession = new ReadingSession(novelId);

      // Initialize auto-save
      if (onSaveProgress) {
        this.autoSave = new ReadingProgressAutoSave(novelId, onSaveProgress);
      }

      // Restore scroll position if we have initial progress
      this.restoreReadingPosition(initialProgress);
    }
  }

  componentDidUpdate(prevProps) {
    const { index, novelId, initialProgress } = this.props;
    const {
      index: prevIndex,
      initialProgress: prevInitialProgress,
    } = prevProps;

    if (index !== prevIndex) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({
        // eslint-disable-next-line react/no-unused-state
        index,
      });

      // Track chapter change
      this.lastChapterIndex = index;
      this.lastScrollPosition = 0; // Reset scroll position for new chapter
      this.lastScrollPercentage = 0;
      this.handleProgressUpdate();
    }

    // Handle initial progress changes (e.g., when progress is loaded from storage)
    if (initialProgress !== prevInitialProgress && initialProgress) {
      this.restoreReadingPosition(initialProgress);
    }
  }

  componentWillUnmount() {
    // Clean up reading session and auto-save
    if (this.readingSession) {
      const timeSpent = this.readingSession.end();
      this.handleProgressUpdate(timeSpent);
    }

    if (this.autoSave) {
      this.autoSave.forceSave();
      this.autoSave.stop();
    }
  }

  handleRenderNode = (node, index, siblings, parent, defaultRenderer) => {
    const { onPressPageLink } = this.props;
    if (node.name === 'chapter') {
      return (
        <Text key={index} style={styles.novelChapter}>
          {node.children.length === 1 && node.children[0].type === 'text'
            ? node.children[0].data
            : defaultRenderer(node.children, parent)}
        </Text>
      );
    }
    if (node.name === 'jump') {
      const { page } = node.attribs;
      return (
        <Text
          key={index}
          style={styles.pageLink}
          onPress={() => onPressPageLink(page)}
        >
          {defaultRenderer(node.children, parent)}
        </Text>
      );
    }
    // Handle image tags in novel content
    if (node.name === 'img' && node.attribs && node.attribs.src) {
      const imgSrc = node.attribs.src;
      // Some Pixiv novel images use a special format, we need to handle both regular URLs and Pixiv-specific ones
      // Convert Pixiv novel image URLs if needed
      const pixivImgRegex = /^\/novel\/img\/(.+)$/;
      const match = imgSrc.match(pixivImgRegex);

      const finalImageUrl = match
        ? `https://i.pximg.net/novel-cover-original/img/${match[1]}`
        : imgSrc;

      return (
        <View key={index} style={{ alignItems: 'center' }}>
          <PXCacheImage uri={finalImageUrl} style={styles.novelImage} />
        </View>
      );
    }
    // other nodes render by default renderer
    return undefined;
  };

  handleOnPressOpenSettings = () => {
    const { openModal } = this.props;
    openModal(MODAL_TYPES.NOVEL_SETTINGS);
  };

  // Reading progress tracking methods
  handleScrollProgress = (
    scrollPosition,
    chapterIndex,
    scrollPercentage = 0,
  ) => {
    this.lastScrollPosition = scrollPosition;
    this.lastChapterIndex = chapterIndex;
    this.lastScrollPercentage = scrollPercentage;
    this.handleProgressUpdate();
  };

  handleProgressUpdate = (additionalReadingTime = 0) => {
    const { items, novelId } = this.props;

    if (!novelId || !this.autoSave) return;

    const totalChapters = items.length;
    const currentChapter = this.lastChapterIndex;
    const scrollPosition = this.lastScrollPosition;
    const scrollPercentage = this.lastScrollPercentage || 0;

    // Calculate overall progress percentage more accurately
    const chapterProgress = currentChapter / totalChapters;
    const withinChapterProgress = scrollPercentage / totalChapters;
    const position = Math.min(1, chapterProgress + withinChapterProgress);

    // Get current reading time
    const currentReadingTime = this.readingSession
      ? this.readingSession.getCurrentDuration()
      : 0;

    const progress = {
      position,
      chapterIndex: currentChapter,
      scrollPosition,
      scrollPercentage,
      lastReadTime: new Date().toISOString(),
      isCompleted: position >= 0.95, // Consider 95% as completed
      totalChapters,
      readingTimeSpent: currentReadingTime + additionalReadingTime,
    };

    // Schedule auto-save
    this.autoSave.scheduleSave(progress);

    // Update reading session
    if (this.readingSession) {
      this.readingSession.update({
        chapterIndex: currentChapter,
        scrollPosition,
        scrollPercentage,
        position,
      });
    }
  };

  restoreScrollPosition = (chapterIndex, scrollPosition) => {
    const scrollViewRef = this.scrollViewRefs[chapterIndex];
    if (scrollViewRef) {
      restoreScrollPosition(scrollViewRef, scrollPosition, false);
    }
  };

  restoreReadingPosition = (initialProgress) => {
    if (!initialProgress) return;

    const { chapterIndex, scrollPosition, position } = initialProgress;

    // Set the chapter index first
    if (chapterIndex !== undefined && chapterIndex !== this.lastChapterIndex) {
      this.lastChapterIndex = chapterIndex;

      // Update the parent component's index if needed
      const { onIndexChange } = this.props;
      if (onIndexChange && chapterIndex !== this.props.index) {
        onIndexChange(chapterIndex);
      }
    }

    // Show resume notification
    if (position > 0.01) {
      // Only show if there's meaningful progress
      const progressPercent = Math.round(position * 100);
      const resumeMessage = `Resuming from ${progressPercent}% (Chapter ${
        chapterIndex + 1
      })`;

      this.setState({
        showResumeNotification: true,
        resumeMessage,
      });

      // Hide notification after 3 seconds
      setTimeout(() => {
        this.setState({ showResumeNotification: false });
      }, 3000);
    }

    // Restore scroll position with multiple attempts to ensure content is rendered
    if (scrollPosition > 0) {
      const attemptRestore = (attempts = 0) => {
        if (attempts >= 5) return; // Max 5 attempts

        setTimeout(() => {
          const scrollViewRef = this.scrollViewRefs[chapterIndex];
          if (scrollViewRef && scrollViewRef.current) {
            this.restoreScrollPosition(chapterIndex, scrollPosition);
          } else {
            // Try again if scroll view ref is not ready
            attemptRestore(attempts + 1);
          }
        }, 500 + attempts * 200); // Increasing delay for each attempt
      };

      attemptRestore();
    }
  };

  handleScroll = (chapterIndex) => (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

    // Calculate scroll percentage within the current chapter
    const scrollPercentage =
      contentSize.height > 0
        ? Math.min(
            1,
            Math.max(
              0,
              contentOffset.y / (contentSize.height - layoutMeasurement.height),
            ),
          )
        : 0;

    this.debouncedScrollHandler(
      contentOffset.y,
      chapterIndex,
      scrollPercentage,
    );
  };

  renderHtmlViewTextComponent = (props) => {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <Text {...props} />;
  };

  renderScene = ({ route }) => {
    const { routes } = this.state;
    const { novelId, fontSize, lineHeight, items, index } = this.props;
    const sceneIndex = routes.indexOf(route);
    const item = items[sceneIndex];
    const pagedItem = item.match(/(.|[\r\n]){1,3000}/g) || [];
    // render text by chunks to prevent over text limit https://github.com/facebook/react-native/issues/15663
    return (
      <View style={styles.container}>
        <ScrollView
          ref={(ref) => {
            this.scrollViewRefs[sceneIndex] = { current: ref };
            // If this is the chapter we need to restore, attempt restoration
            if (
              ref &&
              this.props.initialProgress &&
              this.props.initialProgress.chapterIndex === sceneIndex &&
              this.props.initialProgress.scrollPosition > 0
            ) {
              setTimeout(() => {
                this.restoreScrollPosition(
                  sceneIndex,
                  this.props.initialProgress.scrollPosition,
                );
              }, 100);
            }
          }}
          onScroll={this.handleScroll(sceneIndex)}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator
        >
          {pagedItem.map((t, i) => (
            <HtmlView
              key={`${novelId}-${index}-${i}`} // eslint-disable-line react/no-array-index-key
              value={t}
              renderNode={this.handleRenderNode}
              textComponentProps={{
                style: {
                  fontSize,
                  lineHeight: fontSize * lineHeight,
                },
                selectable: true,
              }}
              TextComponent={this.renderHtmlViewTextComponent}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  renderTabBar = () => null;

  renderProgressIndicator = () => {
    const { items } = this.props;
    const totalChapters = items.length;
    const currentChapter = this.lastChapterIndex;
    const scrollPercentage = this.lastScrollPercentage || 0;

    // Calculate overall progress percentage
    const chapterProgress = currentChapter / totalChapters;
    const withinChapterProgress = scrollPercentage / totalChapters;
    const position = Math.min(1, chapterProgress + withinChapterProgress);

    // Format as percentage
    const progressPercent = Math.round(position * 100);

    return (
      <>
        <View style={styles.progressContainer}>
          <View
            style={[styles.progressBar, { width: `${progressPercent}%` }]}
          />
        </View>
        <View style={styles.progressIndicator}>
          <Text style={styles.progressText}>
            {`${progressPercent}% • Ch ${currentChapter + 1}/${totalChapters}`}
          </Text>
        </View>
      </>
    );
  };

  render() {
    const { onIndexChange } = this.props;
    const { showResumeNotification, resumeMessage } = this.state;

    return (
      <View style={{ flex: 1 }}>
        <PXTabView
          navigationState={this.state}
          renderTabBar={this.renderTabBar}
          renderScene={this.renderScene}
          onIndexChange={onIndexChange}
          lazyPreloadDistance={2}
        />
        {this.renderProgressIndicator()}
        <Snackbar
          visible={showResumeNotification}
          onDismiss={() => this.setState({ showResumeNotification: false })}
          duration={3000}
          style={{ position: 'absolute', bottom: 60 }}
        >
          {resumeMessage}
        </Snackbar>
      </View>
    );
  }
}

export default NovelViewer;
